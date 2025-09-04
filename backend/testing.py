import requests

#  LibreTranslate instance
libretranslate_url = "http://127.0.0.1:5000" 

def translate_text(text, source_lang, target_lang):
    """
    Translates text using LibreTranslate API.
    """
    payload = {
        "q": text,
        "source": source_lang,
        "target": target_lang,
        "format": "text"
    }
    response = requests.post(f"{libretranslate_url}/translate", json=payload)
    response.raise_for_status()  # Raise an exception for bad status codes
    return response.json()["translatedText"]

# Example usage
text_to_translate = "Hello, how are you?"
translated_text = translate_text(text_to_translate, "en", "es")
print(f"Original: {text_to_translate}")
print(f"Translated (Spanish): {translated_text}")

# get a list of supported languages
def get_languages():
    """
    Fetches the list of supported languages from LibreTranslate API.
    """
    response = requests.get(f"{libretranslate_url}/languages")
    response.raise_for_status()
    return response.json()

# Example usage
languages = get_languages()
print("\nSupported Languages:")
for lang in languages:
    print(f"- {lang['name']} ({lang['code']})")