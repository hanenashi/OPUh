# OPUh – Okoun Picture Uploader hacked

Tampermonkey userscript that enhances [Okoun Picture Uploader](https://opu.peklo.biz/) with:

- 🪄 **Resize** – percentage, fixed size, or one dimension  
- ✂️ **Crop** – crop originals and edited images  
- ❌ **Delete** – remove any preview  
- ☰ **Drag & Drop reorder** – change upload order  
- 🖼 **Preview** – smart size, filename truncation, and unsupported format placeholder  
- 📋 **Paste / Drag & Drop** – paste images from clipboard or drag in from desktop

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click here to install OPUh:  
   [**Install Script**](https://github.com/hanenashi/OPUh/raw/refs/heads/main/OPUh.userscript.js)
3. Reload [Okoun Picture Uploader](https://opu.peklo.biz/).

## Usage

- Select or paste/drag images → previews appear below the form.
- Use ✂️ or 🪄 to crop/resize; new versions appear dimmed beside originals.
- Reorder with ☰ handles.
- Delete with ❌.

### Resize syntax (🪄)

When the resize input appears, type:

- `50` → scales image to 50% of original size  
- `800x600` → resizes to exactly 800×600 pixels  
- `800x` → resizes width to 800px, height scales automatically  
- `x600` → resizes height to 600px, width scales automatically  

Press **Enter** to apply, **Esc** to cancel.

## Notes

- Works on latest Chrome and Firefox.
- Script auto-updates from this repository.
