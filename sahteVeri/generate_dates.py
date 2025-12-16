#!/usr/bin/env python3
"""Rastgele tarih üreteci

Kullanım örneği:
python3 generate_dates.py --start 11/10/2025 --end 12/01/2026 --count 120 --out rastgele_tarihler.xlsx

Tarih formatı varsayılan olarak `%d/%m/%Y` (gg/aa/yyyy) kabul edilir.
"""
import argparse
from datetime import datetime, timedelta
import random
from pathlib import Path
import pandas as pd


def parse_date(s: str, fmt: str) -> datetime:
    return datetime.strptime(s, fmt)


def generate_dates(start: datetime, end: datetime, count: int):
    if end < start:
        raise ValueError('End date must be after start date')
    span = (end - start).days
    dates = []
    for _ in range(count):
        d = start + timedelta(days=random.randint(0, span))
        dates.append(d)
    return dates


def main():
    p = argparse.ArgumentParser(description='Rastgele tarih üreteci')
    p.add_argument('--start', '-s', required=False, default='11/10/2025', help='Başlangıç tarihi (ör: 11/10/2025). Varsayılan: 11/10/2025')
    p.add_argument('--end', '-e', required=False, default='12/01/2026', help='Bitiş tarihi (ör: 12/01/2026). Varsayılan: 12/01/2026')
    p.add_argument('--count', '-c', type=int, required=False, default=120, help='Üretilecek tarih sayısı. Varsayılan: 120')
    p.add_argument('--out', '-o', default='rastgele_tarihler.xlsx', help='Çıkış Excel dosyası')
    p.add_argument('--format', '-f', default='%d/%m/%Y', help='Girdi ve çıktı tarih formatı (varsayılan %%d/%%m/%%Y)')

    args = p.parse_args()

    try:
        start = parse_date(args.start, args.format)
        end = parse_date(args.end, args.format)
    except Exception as ex:
        print('Tarih parse hatası:', ex)
        return

    if args.count <= 0:
        print('Count must be > 0')
        return

    dates = generate_dates(start, end, args.count)
    str_dates = [d.strftime(args.format) for d in dates]
    df = pd.DataFrame({'Tarih': str_dates})
    outpath = Path(args.out)
    df.to_excel(outpath, index=False, engine='openpyxl')
    print(f'Saved {len(df)} rows -> {outpath}')
    print('\nSample:')
    print(df.head(10).to_string(index=False))


if __name__ == '__main__':
    main()
