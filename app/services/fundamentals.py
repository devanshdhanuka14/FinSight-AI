import yfinance as yf
import requests
from bs4 import BeautifulSoup

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

def get_fundamentals(ticker: str):
    ticker = ticker.upper().strip()
    
    price_data = fetch_yfinance_data(ticker)
    
    soup = _get_screener_soup(ticker)
    ratios = fetch_screener_data(soup)
    revenue_growth = _get_growth_from_pl(soup, "Sales")
    profit_growth = _get_growth_from_pl(soup, "Net Profit")
    shareholding= _get_shareholding(soup)
    
    return {
        **price_data,
        "roce": float(ratios.get("ROCE", 0)) or None,
        "roe": float(ratios.get("ROE", 0)) or None,
        "revenue_growth": revenue_growth,
        "profit_growth": profit_growth,
        "shareholding_pattern":shareholding
        }