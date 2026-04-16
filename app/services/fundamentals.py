import yfinance as yf

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