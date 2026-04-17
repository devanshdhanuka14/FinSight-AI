import feedparser
import yfinance as yf
from datetime import datetime, timezone, timedelta

def fetch_yfinance_news(ticker: str) -> list:
    stock = yf.Ticker(f"{ticker}.NS")
    news = stock.news or []
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    headlines = []
    
    for item in news[:15]:
        title = item.get('content', {}).get('title', '')
        pub_date_str = item.get('content', {}).get('pubDate', '')
        
        if not title or not pub_date_str:
            continue
            
        publish_time = datetime.strptime(pub_date_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        
        if publish_time >= cutoff:
            headlines.append({
                "headline": title,
                "date": publish_time.strftime("%Y-%m-%d")
            })
    
    return headlines


def fetch_rss_news(company_name: str) -> list:
    query = f"{company_name} stock NSE India".replace(" ", "+")
    url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
    feed = feedparser.parse(url)

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    

    headlines = []
  
    for entry in feed.entries[:15]:

        if not entry.published_parsed:
            continue
            
        publish_time = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

        title = entry.get("title", "")

        
        headlines.append({
            "headline": title,
            "date": publish_time.strftime("%Y-%m-%d")
        })

    return headlines

def fetch_news(ticker: str, company_name: str) -> list:
    headlines = fetch_yfinance_news(ticker)
    if len(headlines) < 8:
        rss_headlines = fetch_rss_news(company_name)
        # Avoid duplicates
        existing = set(h["headline"].lower() for h in headlines)
        for h in rss_headlines:
            if h["headline"].lower() not in existing:
                headlines.append(h)
    return headlines