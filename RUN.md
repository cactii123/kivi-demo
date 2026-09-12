# RUN.md

## 1. Runtime

Python 3.8 or later (no packages required — the built-in `http.server` module is used).

Verify:
```bash
python3 --version
```

## 2. Install dependencies

None. The prototype is a static web application. No `npm install`, `pip install`, or build step is required.

## 3. Start the prototype

```bash
cd kivi-demo
python3 -m http.server 8000
```

## 4. Open the prototype

```
http://localhost:8000
```

Open in **Chrome or Edge**. (Firefox works for everything except voice input, which requires the Web Speech API.)

---

## First steps once open

1. Go to **styles** (sidebar → styles, or press `8`) → set Hours to **night owl**.
2. Press `3` or click **hey kivi** and type:
   ```
   find the dictation from around 5pm yesterday about the vendor call and polish it for the meeting
   ```
   This works immediately — the matching dictation is pre-seeded.
3. Press `0` or click **dev corpus** → click **"ingest corpus → live memory"** to load all 500 corpus records into the live pipeline.
