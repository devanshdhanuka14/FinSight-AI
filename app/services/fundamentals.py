import yfinance as yf
import requests
from bs4 import BeautifulSoup
import pandas as pd
from app.services.nse import fetch_nse_data

def fetch_yfinance_data(ticker: str):
    yf_ticker = yf.Ticker(f"{ticker}.NS")
    info = yf_ticker.info

    # info.get("key") instead of info["key"] — because Indian stocks often have missing keys, .get() returns None instead of crashing

    current = info.get("currentPrice")
    prev_close = info.get("previousClose")

    change_pct=None
    if current and prev_close:
        change_pct = round(((current - prev_close) / prev_close) * 100 , 2)

    return {
        "company_name": info.get("longName"),
        "current_price": current,
        "previous_close": prev_close,
        "change_pct": change_pct,
        "week_52_high": info.get("fiftyTwoWeekHigh"),
        "week_52_low": info.get("fiftyTwoWeekLow"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "eps": info.get("trailingEps"),
    }

def _get_screener_soup(ticker: str):
    url = f"https://www.screener.in/company/{ticker}/consolidated/"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    
    response = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(response.text, "html.parser") 
    # the soup object contains the entire HTML of that URL, every tag, every div, every number on that page
    # response is the object that contains two things response.status_code and response.text, response.text gives the actual HTML content as a plain string
    return soup

def fetch_screener_data(soup):

    ratios = {}
    for li in soup.select("li.flex.flex-space-between"):
        name = li.select_one(".name")
        value = li.select_one(".number")
        if name and value:
            ratios[name.get_text(strip=True)] = value.get_text(strip=True)

    return ratios

def _get_growth_from_pl(soup, label):
    rows = soup.select("section#profit-loss tr")
    
    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue
            
        if label.lower() in cells[0].get_text(strip=True).lower():
            values = []
            for cell in cells[1:]:
                text = cell.get_text(strip=True).replace(",", "")
                try:
                    values.append(float(text))
                except ValueError:
                    continue
            
            if len(values) >= 4:
                g1 = round((values[-3] - values[-4]) / abs(values[-4]) * 100, 2)
                g2 = round((values[-2] - values[-3]) / abs(values[-3]) * 100, 2)
                g3 = round((values[-1] - values[-2]) / abs(values[-2]) * 100, 2)
                return [g1, g2, g3]
    
    return None

def _get_shareholding(soup):
    rows=soup.select("section#shareholding #quarterly-shp tr")  
    labels=["Promoters","FIIs","DIIs"]

    results={}

    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue
        
        first_cell=cells[0].get_text(strip=True).replace("+","")

        if any(label in first_cell for label in labels):
            values = []
            for cell in cells[-4:]:
                text = cell.get_text(strip=True).replace("%", "")
                try:
                    values.append(float(text))
                except ValueError:
                    continue
            results[first_cell] = values

    return results

def _get_screener_company_id(soup) -> str:
    company_info = soup.select_one("#company-info")
    if company_info:
        return company_info.get("data-warehouse-id")
    return None

def _parse_screener_number(text: str):
    if not text:
        return None
    import re
    cleaned = re.sub(r"[^\d.\-]", "", text.strip())
    return float(cleaned) if cleaned else None

def fetch_peers(soup) -> list:
    warehouse_id = _get_screener_company_id(soup)
    if not warehouse_id:
        return []
    
    url = f"https://www.screener.in/api/company/{warehouse_id}/peers/"
    headers = {"User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"}
    
    resp = requests.get(url, headers=headers, timeout=10)
    peers_soup = BeautifulSoup(resp.text, "html.parser")
    
    peers = []
    rows = peers_soup.select("tbody tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 10:
            continue
        name_el = cells[1].select_one("a")
        if not name_el:
            continue
        peers.append({
            "name": name_el.get_text(strip=True),
            "cmp": _parse_screener_number(cells[2].get_text(strip=True)),
            "pe": _parse_screener_number(cells[3].get_text(strip=True)),
            "market_cap": _parse_screener_number(cells[4].get_text(strip=True)),
            "div_yield": _parse_screener_number(cells[5].get_text(strip=True)),
            "qtr_profit_growth": _parse_screener_number(cells[7].get_text(strip=True)),
            "qtr_sales_growth": _parse_screener_number(cells[9].get_text(strip=True)),
            "roce": _parse_screener_number(cells[10].get_text(strip=True)),
        })
    
    return peers

def compute_indicators(df: pd.DataFrame):
    df["MA20"] = df["Close"].rolling(20).mean()
    df["MA50"] = df["Close"].rolling(50).mean()

    # RSI
    delta = df["Close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = -delta.clip(upper=0).rolling(14).mean()
    rs = gain / loss
    df["RSI"] = 100 - (100 / (1 + rs))

    # Average volume
    df["AvgVol20"] = df["Volume"].rolling(20).mean()

    return df

def is_volume_spike(df: pd.DataFrame, threshold: float = 1.5):
    last = df.iloc[-1]
    vol = last["Volume"]
    avg = last["AvgVol20"]
    if pd.isna(avg) or avg == 0:
        return False, 0.0
    ratio = vol / avg
    spike = ratio >= threshold
    return spike, round(ratio, 2)

def get_signal(df: pd.DataFrame):
    last = df.iloc[-1]
    price = last["Close"]
    ma20 = last["MA20"]
    ma50 = last["MA50"]
    rsi = round(last["RSI"], 1)

    above_ma20 = price > ma20
    above_ma50 = price > ma50

    # Trend
    if above_ma20 and above_ma50:
        trend = "Bullish structure"
    elif above_ma20 and not above_ma50:
        trend = "Short-term strength, long-term weak"
    elif not above_ma20 and above_ma50:
        trend = "Short-term weakness, long-term hold"
    else:
        trend = "Bearish structure"

    # Momentum
    if rsi > 70:
        momentum = "overbought — watch for reversal"
    elif rsi > 55:
        momentum = "bullish momentum"
    elif rsi > 45:
        momentum = "neutral"
    elif rsi > 30:
        momentum = "bearish momentum"
    else:
        momentum = "oversold — watch for bounce"

    # Confluence
    if above_ma20 and above_ma50 and rsi > 55 and rsi <= 70:
        verdict = "STRONG BUY SIGNAL"
    elif above_ma20 and above_ma50 and rsi > 70:
        verdict = "BULLISH BUT OVEREXTENDED"
    elif not above_ma20 and not above_ma50 and rsi < 45 and rsi >= 30:
        verdict = "STRONG SELL SIGNAL"
    elif not above_ma20 and not above_ma50 and rsi < 30:
        verdict = "BEARISH BUT OVERSOLD"
    elif above_ma20 and above_ma50 and rsi < 45:
        verdict = "BULLISH STRUCTURE, WEAK MOMENTUM — WAIT"
    elif not above_ma20 and not above_ma50 and rsi > 55:
        verdict = "BEARISH STRUCTURE, STRONG MOMENTUM — CONFLICTED"
    else:
        verdict = "MIXED SIGNALS"

    # Reasoning
    ma20_diff = round(((price - ma20) / ma20) * 100, 2)
    ma50_diff = round(((price - ma50) / ma50) * 100, 2)

    reasoning = (
        f"Price is {'above' if above_ma20 else 'below'} MA20 by {abs(ma20_diff)}% "
        f"and {'above' if above_ma50 else 'below'} MA50 by {abs(ma50_diff)}%. "
        f"RSI at {rsi} indicates {momentum}."
    )

    return verdict, trend, reasoning

def get_technicals(ticker: str) -> dict:
    stock = yf.Ticker(f"{ticker}.NS")
    df = stock.history(period="6mo")
    
    if df.empty:
        return {}
    
    df = compute_indicators(df)
    verdict, trend, reasoning = get_signal(df)
    spike, ratio = is_volume_spike(df)
    
    return {
        "trend": trend,
        "verdict": verdict,
        "reasoning": reasoning,
        "volume_spike": bool(spike),
        "volume_ratio": float(ratio),  
        "rsi": round(df.iloc[-1]["RSI"], 1),
        "ma20": round(df.iloc[-1]["MA20"], 2),
        "ma50": round(df.iloc[-1]["MA50"], 2),
    }

def get_fundamentals(ticker: str):
    ticker = ticker.upper().strip()
    
    price_data = fetch_yfinance_data(ticker)
    
    soup = _get_screener_soup(ticker)
    ratios = fetch_screener_data(soup)
    revenue_growth = _get_growth_from_pl(soup, "Sales")
    profit_growth = _get_growth_from_pl(soup, "Net Profit")
    shareholding= _get_shareholding(soup)
    technicals = get_technicals(ticker)
    peers = fetch_peers(soup)

    try:
        nse_data = fetch_nse_data(ticker)
    except Exception as e:
        print(f"NSE fetch failed for {ticker}: {e}")
        nse_data = {}
    
    return {
        **price_data,
        "roce": float(ratios.get("ROCE", 0)) or None,
        "roe": float(ratios.get("ROE", 0)) or None,
        "revenue_growth": revenue_growth,
        "profit_growth": profit_growth,
        "shareholding_pattern":shareholding,
        "technicals": technicals,
        "nse": nse_data,
        "peers": peers
        }