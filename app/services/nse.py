import requests
from datetime import datetime

BASE_URL = "https://www.nseindia.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}

# Announcement types we actually care about
MATERIAL_KEYWORDS = [
    "financial result", "board meeting", "acquisition", "merger",
    "demerger", "dividend", "buyback", "credit rating", "litigation",
    "dispute", "regulatory action", "investor presentation", 
    "press release", "updates", "news verification", "scheme",
    "qualified institutional", "sale or disposal", "disinvestment",
    "change in management", "transcript"
]

def is_material(desc: str) -> bool:
    desc_lower = desc.lower()
    junk = ["disclosure under regulation", "trading window", "newspaper"]
    if any(j in desc_lower for j in junk):
        return False
    return any(keyword in desc_lower for keyword in MATERIAL_KEYWORDS) # we are doing substring matching here

def get_nse_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    return session

def parse_nse_data(raw: dict) -> dict:
    # Extract symbol data
    equity = raw["symbol_data"].get("equityResponse", [])
    symbol = equity[0] if equity else {}
    sec_info = symbol.get("secInfo", {})
    trade_info = symbol.get("tradeInfo", {})
    price_info = symbol.get("priceInfo", {})

    # Extract returns
    returns = raw["returns_data"][0] if raw["returns_data"] else {}

    # Filter announcements to material ones only, last 10
    material = [
        {
            "date": a["an_dt"],
            "type": a["desc"],
            "summary": a["attchmntText"]
        }
        for a in raw["announcements"]
        if is_material(a.get("desc", ""))
        and "disclosure under regulation" not in a.get("attchmntText", "").lower()
    ][:10]

    return {
        "sector": sec_info.get("sector"),
        "industry": sec_info.get("basicIndustry"),
        "sector_pe": sec_info.get("pdSectorPe"),
        "symbol_pe": sec_info.get("pdSymbolPe"),
        "annual_volatility": price_info.get("cmAnnualVolatility"),
        "delivery_pct": trade_info.get("deliveryToTradedQuantity"),
        "index_name": returns.get("index_name"),
        "returns": {
            "one_month": returns.get("one_month_chng_per"),
            "three_month": returns.get("three_month_chng_per"),
            "one_year": returns.get("one_year_chng_per"),
        },
        "index_returns": {
            "one_month": returns.get("index_one_month_chng_per"),
            "three_month": returns.get("index_three_month_chng_per"),
            "one_year": returns.get("index_one_year_chng_per"),
        },
        "announcements": material
    }

def fetch_nse_data(ticker: str) -> dict:
    session = get_nse_session()
    
    # Symbol data — price, sector PE, volatility, delivery %
    symbol_url = f"{BASE_URL}/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol={ticker}"
    symbol_resp = session.get(symbol_url, timeout=10)
    symbol_data = symbol_resp.json()
    
    # Returns vs Nifty
    returns_url = f"{BASE_URL}/api/NextApi/apiClient/GetQuoteApi?functionName=getYearwiseData&symbol={ticker}EQN"
    returns_resp = session.get(returns_url, timeout=10)
    returns_data = returns_resp.json()
    
    # Corporate announcements
    annc_url = f"{BASE_URL}/api/corporate-announcements?index=equities&symbol={ticker}"
    annc_resp = session.get(annc_url, timeout=10)
    annc_data = annc_resp.json()
    
    raw = {
        "symbol_data": symbol_data,
        "returns_data": returns_data,
        "announcements": annc_data
    }
    return parse_nse_data(raw)

LANDING_INDICES = ["NIFTY 50", "NIFTY BANK", "NIFTY IT", "NIFTY MIDCAP 100", "NIFTY NEXT 50"]

def fetch_market_indices() -> list:
    session = get_nse_session()
    url = f"{BASE_URL}/api/NextApi/apiClient?functionName=getIndexData&&type=All"
    resp = session.get(url, timeout=10)
    data = resp.json()
    
    indices = []
    for item in data.get("data", []):
        if item.get("indexName") in LANDING_INDICES:
            indices.append({
                "name": item["indexName"],
                "last": item["last"],
                "change_pct": item["percChange"],
                "year_high": item["yearHigh"],
                "year_low": item["yearLow"],
            })
    
    return indices