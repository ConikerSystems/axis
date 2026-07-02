# Axis 1942

A faithful, installable digital edition of the **Axis & Allies 1942 Second Edition**
world-war strategy board game. Vanilla-JS PWA — plays offline on an iPad home screen.

- **Hotseat** pass-and-play for up to 5 powers, plus **computer opponents** (assign any
  power to the AI).
- Full 1942.2 rules: purchase, combat/noncombat movement, blitzing, amphibious assaults,
  submarines, carriers, strategic bombing, capital capture, victory cities.
- **Custom layouts**: reassign starting territories between powers (e.g. hand Australia to
  Japan) before the game starts.
- **Optional rules**: Turkish Straits closed, fighter escorts & interceptors, Total Victory.

## Play locally
```
python3 -m http.server 8642
# open http://localhost:8642
```

## Tests
```
node tests/engine.test.js   # 29 rules unit tests
node tests/smoke.test.js    # full AI-vs-AI games
```

## Board data
`static/js/map-data.js` is generated from the TripleA community map
[`world_war_ii_v5_1942`](https://github.com/triplea-maps/world_war_ii_v5_1942) by
`tools/convert-triplea.js`, and cross-checked against the official rulebook (starting
incomes 24/41/31/30/42, 13 victory cities). Do not hand-edit it.

---
Coniker Systems™ · fan-made for personal use. Axis & Allies is a trademark of its owners.
