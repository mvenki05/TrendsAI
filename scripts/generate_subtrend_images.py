"""
Generate editorial card images for subtrend carousel cards via the LiteLLM gateway.
One image per subtrend, saved as static files:

    dashboard/public/subtrends/<megatrend_key>-<index>.png

Generated ONCE and committed as assets. Re-run specific images with --only <key>-<idx>
or regenerate an entire megatrend with --megatrend <key>.

Usage:
    python scripts/generate_subtrend_images.py                 # all missing
    python scripts/generate_subtrend_images.py --force         # regenerate all
    python scripts/generate_subtrend_images.py --megatrend value
    python scripts/generate_subtrend_images.py --only value-2
"""

import argparse
import base64
import logging
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUT_DIR = Path(__file__).parent.parent / "dashboard" / "public" / "subtrends"

BASE_URL = (os.getenv("LITELLM_BASE_URL") or "").rstrip("/")
API_KEY = os.getenv("LITELLM_API_KEY")
MODEL = os.getenv("LITELLM_IMAGE_MODEL")

STYLE = "Professional food photography, vibrant and appetizing. No text, no words, no logos, no brand names, no human faces."

# Keyed by "<megatrend_key>-<index>" — every image is a completely different food, cuisine, color palette and setting.
SUBJECTS: dict[str, str] = {
    # ── blur ─────────────────────────────────────────────────────────
    "blur-0":        "Steaming bowl of tonkotsu ramen with chashu pork, soft-boiled egg and nori on a dark lacquered tray, rich creamy broth, dramatic overhead light, deep shadows.",
    "blur-1":        "Colorful Mexican street tacos on a paper plate — al pastor with pineapple, cilantro and diced onion, a lime wedge — vibrant greens and oranges, outdoors.",
    "blur-2":        "Classic American cheeseburger sliced in half showing melted cheese and juicy patty, served in a red-checked paper basket with crispy fries.",
    "blur-3":        "Vibrant Indian butter chicken in an orange sauce served in a copper karahi with basmati rice and a garlic naan, warm golden light.",
    "blur-4":        "Crispy Korean fried chicken glazed in gochujang sauce, garnished with sesame seeds and sliced scallion, bright white studio background.",
    "blur-5":        "Thin-crust Neapolitan pizza fresh from a wood-fired oven, leopard-spotted char on the crust, torn fresh basil, olive oil drizzle on a dark peel.",
    "blur-6":        "Vietnamese pho in a wide white bowl — rare beef, bean sprouts, Thai basil, sliced chili — with chopsticks and a ceramic spoon, bright natural daylight.",

    # ── cleanlabel ───────────────────────────────────────────────────
    "cleanlabel-0":  "Greek mezze platter — hummus, tzatziki, stuffed grape leaves, pita wedges, olives and feta — on a blue ceramic serving board, Mediterranean light.",
    "cleanlabel-1":  "Sizzling cast-iron skillet of Spanish paella with shrimp, mussels, chicken and saffron-yellow rice, outdoors over an open flame.",
    "cleanlabel-2":  "Brazilian churrasco: thick-cut picanha on a hot grill, charred exterior, pink interior, coarse salt crystals, smoke rising.",
    "cleanlabel-3":  "Japanese bento box opened to reveal compartments of onigiri, tamago, edamame, karaage and pickled vegetables — balanced, colorful, precise.",
    "cleanlabel-4":  "Fresh ceviche in a lime-marinated citrus broth with shrimp, red onion, aji amarillo and popcorn, served in a stone bowl, Peruvian coastal setting.",
    "cleanlabel-5":  "Moroccan lamb tagine with apricots, almonds and cinnamon in a terracotta pot, lid just lifted, aromatic steam rising, warm orange and amber tones.",
    "cleanlabel-6":  "Whole roasted branzino with lemon slices and fresh herbs on a white oval platter, Mediterranean herbs and a glass of white wine alongside.",

    # ── conscious ────────────────────────────────────────────────────
    "conscious-0":   "Shakshuka: eggs poached in a spiced tomato and pepper sauce in a black skillet, feta crumbled on top, crusty bread on the side, rustic kitchen.",
    "conscious-1":   "Pad Thai in a wok with shrimp, rice noodles, bean sprouts, crushed peanuts and a lime wedge — wok-charred, glossy, street-food style.",
    "conscious-2":   "Levantine kibbeh platter: golden fried bulgur shells filled with spiced lamb, pine nuts, a yogurt dip and fresh mint on a carved wooden board.",
    "conscious-3":   "Hawaiian poke bowl: cubed ahi tuna, cucumber, avocado, tobiko and sesame on sushi rice with a soy-sesame drizzle, bright tropical light.",
    "conscious-4":   "Ethiopian injera spread — misir, tibs, gomen and ayib in small mounds on a large round injera — colorful, communal, earthy tones.",
    "conscious-5":   "Taiwanese beef noodle soup: thick-cut braised beef, hand-pulled noodles, bok choy in a dark spiced broth with a chili crisp on the side.",
    "conscious-6":   "Peruvian lomo saltado: wok-fried beef strips with tomatoes, red onion and aji amarillo tossed with crispy fries, served over white rice.",
    "conscious-7":   "Swedish smörgåsbord vignette: gravlax with dill, pickled herring, crispbread, Jarlsberg and lingonberry jam on a white tablecloth, cool Scandinavian light.",

    # ── convenience ─────────────────────────────────────────────────
    "convenience-0": "Turkish döner kebab shaved from a vertical rotisserie into a warm lavash wrap with tomato, cabbage and garlic sauce, street-side warm glow.",
    "convenience-1": "Dim sum cart with bamboo steamers opened to reveal char siu bao, har gow and siu mai, chopsticks resting on the edge, Cantonese teahouse setting.",
    "convenience-2": "Freshly made guacamole in a large molcajete with tortilla chips scattered around it, bright overhead light, vibrant green.",
    "convenience-3": "Lobster roll on a toasted split-top bun with mayonnaise and chives, a pile of kettle chips alongside, New England summer aesthetic.",
    "convenience-4": "Birria tacos with a cup of deep-red consommé for dipping, melted cheese, cilantro and onion, griddle marks on the tortilla, dramatic warm light.",
    "convenience-5": "Creamy mac and cheese in a cast-iron skillet with a golden breadcrumb crust, fresh out of the oven, comfort food close-up.",
    "convenience-6": "Crispy fish and chips in newspaper cones with malt vinegar and tartar sauce, seaside light, classic British takeaway vibe.",

    # ── flavor ───────────────────────────────────────────────────────
    "flavor-0":      "Whole Peking duck presented tableside — lacquered mahogany skin, chef carving it — with pancakes, hoisin and scallion on a red-accented table.",
    "flavor-1":      "Banh mi sandwich sliced in half revealing layers of pork belly, pickled daikon, jalapeño and cilantro on a crispy baguette, Vietnamese street-food energy.",
    "flavor-2":      "Argentinian asado: a full beef rib rack on a wood-fired parrilla, char lines, rendered fat, coarse chimichurri in a stone bowl beside it.",
    "flavor-3":      "Neapolitan gelato scoops in a cone — pistachio, stracciatella and blood orange — vibrant colors, Italian street, afternoon sun.",
    "flavor-4":      "Mapo tofu in a clay pot — silken tofu in crimson Sichuan doubanjiang sauce with minced pork, Sichuan peppercorn oil — bold red, steaming.",
    "flavor-5":      "Jerk chicken plated over festival dumplings with a mango salsa and scotch bonnet hot sauce, vivid Caribbean color palette.",
    "flavor-6":      "Cheese fondue in a classic caquelon with cubes of crusty bread and cornichons, alpine chalet warmth, golden candlelight.",
    "flavor-7":      "Khao man gai: poached chicken over fragrant jasmine rice with clear broth, dark soy and ginger sauce, cucumber slices, Thai street-food minimalism.",

    # ── functional ──────────────────────────────────────────────────
    "functional-0":  "Classic French onion soup in a ramekin with a golden gruyère crust, straight from the broiler, bubbling edges, dark bistro setting.",
    "functional-1":  "Steaming hot congee in a wide bowl topped with a century egg, ginger slivers, peanuts and fried shallots, chopsticks and white ceramic spoon.",
    "functional-2":  "Bibimbap in a stone dolsot: colorful arranged toppings — carrot, spinach, zucchini, bean sprouts, beef bulgogi, a fried egg — sizzling at the edges.",
    "functional-3":  "Handmade pasta — wide pappardelle — with a slow-cooked wild boar ragù, grated pecorino and fresh basil, rustic Tuscan kitchen.",
    "functional-4":  "Mole negro sauce poured over a plated turkey leg, scattered sesame seeds and a sprig of epazote, dark moody tones, Oaxacan depth.",
    "functional-5":  "Grilled whole octopus tentacle on charred lemon slices, smoked paprika oil drizzle, sea salt, Spanish coastal restaurant table.",
    "functional-6":  "Coconut green curry with chicken and Thai eggplant in a bright green broth, served in a carved coconut shell, tropical and vibrant.",

    # ── glp1 ─────────────────────────────────────────────────────────
    "glp1-0":        "Roasted cauliflower steak with harissa, pomegranate seeds, tahini drizzle and fresh parsley on a large white plate, bold Middle Eastern color.",
    "glp1-1":        "Freshly shucked oysters on a bed of crushed ice with mignonette sauce and lemon wedges, coastal light, silver platter.",
    "glp1-2":        "Lamb kofta skewers on a grill with flames visible, served on flatbread with tzatziki and sumac-dressed tomatoes, Eastern Mediterranean setting.",
    "glp1-3":        "Tom yum goong soup: clear amber broth with prawns, lemongrass, galangal, kaffir lime and mushrooms in a clay pot, Thai heat and aroma.",
    "glp1-4":        "Duck confit with crispy skin, lentils du Puy and a red wine reduction on a white plate, classic French brasserie plating.",
    "glp1-5":        "Soba noodles in a cold tsuyu dipping sauce, nori strip, grated daikon and wasabi on the side, Japanese summer minimalism.",
    "glp1-6":        "Cochinita pibil tacos: slow-roasted achiote pork in handmade corn tortillas with pickled red onion and habanero salsa, vivid Yucatecan colors.",

    # ── protein ──────────────────────────────────────────────────────
    "protein-0":     "Wood-fired Florentine T-bone steak sliced to reveal a perfect rare interior, fresh rosemary, coarse salt and a cast-iron pan, dramatic firelight.",
    "protein-1":     "Steaming bowl of pho bo: rare beef slices just-added to the broth, rice noodles, star anise and cinnamon in the background, aromatic and warming.",
    "protein-2":     "Whole roasted chicken — golden skin, herbs tucked under — in a Le Creuset on a dark wooden table, steam rising, Sunday roast energy.",
    "protein-3":     "Freshwater trout grilled over campfire coals on a stick, lemon and herbs inside, forest setting, open flame and smoke.",
    "protein-4":     "Sashimi platter on black slate — thick cuts of bluefin tuna, yellowtail and salmon — with wasabi, pickled ginger and soy, Japanese precision.",
    "protein-5":     "Pulled pork sandwich on a brioche bun, coleslaw on top, a pool of BBQ sauce, southern smoke-pit aesthetic, warm orange light.",
    "protein-6":     "Whole roasted sea bass stuffed with fennel and citrus on a bed of roasted vegetables, Mediterranean white tablecloth, olive oil glistening.",
    "protein-7":     "Smash burger on a griddle in progress — beef balls being pressed flat, cheese melting, steam rising — diner kitchen, high-energy close-up.",

    # ── social ───────────────────────────────────────────────────────
    "social-0":      "Steaming hot bibimbap stone pot with colorful vegetables and a raw egg cracked on top, about to be mixed, Korean restaurant table.",
    "social-1":      "Chili crab in a wok — whole blue swimmer crab in a glossy tomato-chili sauce — with fried mantou buns on the side, Singaporean hawker-center light.",
    "social-2":      "Chimichanga freshly fried until golden, sliced open to reveal spiced beef and melted cheese, sour cream and guacamole alongside.",
    "social-3":      "Persian tahdig: golden crispy rice crust overturned onto a platter with saffron-braised chicken and barberries, jeweled and celebratory.",
    "social-4":      "Oyakodon: chicken and egg simmered in dashi and mirin served over steamed rice in a lacquered bowl, delicate Japanese home-cooking light.",
    "social-5":      "Borscht in a deep red bowl with a dollop of smetana, fresh dill and dark rye bread on the side, Eastern European warmth.",
    "social-6":      "Rendang: dry-fried beef coated in toasted coconut and chili paste with turmeric rice, dark dramatic Indonesian plating.",
    "social-7":      "Classic eggs Benedict: Canadian bacon, poached eggs and hollandaise on an English muffin, golden yolk running, brunch morning light.",
    "social-8":      "Whole steamed Dungeness crab on butcher paper at a table with melted butter, sourdough bread and a cold Pilsner, West Coast feast.",
    "social-9":      "Beef bulgogi on a tabletop charcoal grill, tongs beside the grill, banchan in small side dishes, Korean BBQ restaurant glow.",
    "social-10":     "Sicilian arancini halved to show a molten risotto and ragù interior, crumbed golden crust, fresh tomato sauce for dipping.",
    "social-11":     "Bánh xèo Vietnamese sizzling crêpe broken open at the table — shrimp, pork belly, bean sprouts inside — crispy edges, fresh herbs alongside.",

    # ── value ────────────────────────────────────────────────────────
    "value-0":       "Massaman curry with slow-cooked beef, potato and peanuts in a rich coconut sauce served with jasmine rice, warm golden Thai tones.",
    "value-1":       "Hand-stretched sourdough pizza with mozzarella, San Marzano tomatoes and fresh basil, just out of a home oven, wood board.",
    "value-2":       "Lamb biryani in a handi with a lifted dough seal, fragrant steam, saffron rice, whole spices and a raita in a small bowl, Mughal grandeur.",
    "value-3":       "Taiwanese beef noodle soup: dark braised beef shank, hand-pulled noodles, garlic chive and a spoonful of chili oil, bold umami.",
    "value-4":       "Puerto Rican mofongo: mashed fried plantain in a pilón topped with garlic shrimp in a tomato-based sauce, Caribbean warmth.",
    "value-5":       "Tartiflette: potato, lardons and onion gratin with a whole Reblochon melted on top, golden and bubbling, Alpine ski-chalet setting.",
}


def _headers() -> dict:
    return {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def _extract_b64_from_images_api(data: dict) -> str | None:
    for item in data.get("data") or []:
        if item.get("b64_json"):
            return item["b64_json"]
    return None


def _extract_b64_from_chat(data: dict) -> str | None:
    for choice in data.get("choices") or []:
        msg = choice.get("message") or {}
        for img in msg.get("images") or []:
            url = (img.get("image_url") or {}).get("url") or ""
            if url.startswith("data:image"):
                return url.split(",", 1)[1]
        content = msg.get("content")
        if isinstance(content, list):
            for part in content:
                url = ((part.get("image_url") or {}).get("url") or "") if isinstance(part, dict) else ""
                if url.startswith("data:image"):
                    return url.split(",", 1)[1]
    return None


def generate(slug: str, prompt: str) -> bytes:
    r = requests.post(
        f"{BASE_URL}/v1/images/generations",
        headers=_headers(),
        json={"model": MODEL, "prompt": prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"},
        timeout=300,
    )
    if r.ok:
        b64 = _extract_b64_from_images_api(r.json())
        if b64:
            return base64.b64decode(b64)
    logger.info("[%s] images API unavailable (%s) — trying chat completions", slug, r.status_code)

    r = requests.post(
        f"{BASE_URL}/v1/chat/completions",
        headers=_headers(),
        json={"model": MODEL, "messages": [{"role": "user", "content": prompt}], "modalities": ["image", "text"]},
        timeout=300,
    )
    r.raise_for_status()
    b64 = _extract_b64_from_chat(r.json())
    if not b64:
        raise RuntimeError(f"No image in response for {slug}: {str(r.json())[:400]}")
    return base64.b64decode(b64)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    parser.add_argument("--only", default=None, help="generate a single slug, e.g. value-2")
    parser.add_argument("--megatrend", default=None, help="generate all subtrends for one megatrend key")
    args = parser.parse_args()

    if not (BASE_URL and API_KEY and MODEL):
        sys.exit("Missing LITELLM_BASE_URL / LITELLM_API_KEY / LITELLM_IMAGE_MODEL in .env")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.only:
        slugs = [args.only]
    elif args.megatrend:
        slugs = [s for s in SUBJECTS if s.startswith(f"{args.megatrend}-")]
    else:
        slugs = list(SUBJECTS)

    for slug in slugs:
        if slug not in SUBJECTS:
            logger.error("Unknown slug: %s (known: %s)", slug, ", ".join(sorted(SUBJECTS)))
            continue
        out = OUT_DIR / f"{slug}.png"
        if out.exists() and not args.force:
            logger.info("[%s] exists — skipping (use --force to regenerate)", slug)
            continue
        prompt = f"{SUBJECTS[slug]} {STYLE}"
        logger.info("[%s] generating…", slug)
        try:
            png = generate(slug, prompt)
        except Exception as e:
            logger.error("[%s] FAILED: %s", slug, e)
            continue
        out.write_bytes(png)
        logger.info("[%s] saved %s (%.0f KB)", slug, out, len(png) / 1024)


if __name__ == "__main__":
    main()
