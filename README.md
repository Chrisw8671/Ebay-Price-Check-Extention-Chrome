# eBay Sold Price Panel — Chrome Extension

A floating sidebar that appears on any eBay item page showing:
- Recently sold prices (last 60 results)
- Average sold price
- Sales volume (how many sold)
- Active listing count
- A min–max price range bar

## Installation (Chrome / Edge / Brave)

1. Open your browser and go to: `chrome://extensions`
2. Enable **Developer Mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `ebay-sold-panel` folder (this folder)
5. Done! Navigate to any eBay listing — the panel will appear on the right

## How it works

- Runs automatically on `ebay.co.uk` and `ebay.com` item pages (`/itm/...`)
- Extracts the item title from the page
- Searches eBay's completed/sold listings with that title
- Parses the results and shows them in the sidebar
- The sidebar is draggable (drag the orange header up/down)
- Click ‹ to collapse it, ↻ to refresh

## Limitations

- eBay's search results are public so no API key needed, but eBay may
  occasionally update their page structure which could break the scraper.
  If results stop appearing, open an issue or re-fetch the extension.
- Sold count shown is from the first page of results (up to 60 items).
  For high-volume items the true sold count will be higher.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (permissions, host matches) |
| `content.js` | All logic: UI injection, eBay scraping, parsing |
| `panel.css` | Sidebar styles |
| `icon.png` | Extension icon |
