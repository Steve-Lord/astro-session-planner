# WMM2025 source data

World Magnetic Model 2025 (epoch 2025.0, valid 2025.0-2030.0), NOAA NCEI / BGS. US Government work, public domain.

- Model page: https://www.ncei.noaa.gov/products/world-magnetic-model
- Download: https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip
- Downloaded: 2026-11-22
- Archive sha256: `2e76569370d081f2cd7919490218bd094ca9afde347b198eff5621e0af460d03`
- `WMM2025.COF` sha256: `dfa8597825af4e0b87ff4198a5b4fb661b3c49f4cd090cd0164e0259b075582f`
- `WMM2025_TestValues.txt` sha256: `e6975b093dddeb6153e0b23cc418425c438167e7c5b1dd795da379cb654f5819`

Both files are copied unmodified from the archive. `npm run build:wmm` turns the COF into `src/lib/sweep/wmm2025.ts`.
