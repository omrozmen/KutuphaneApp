#!/usr/bin/env python3
"""Sahte veri üreteci

Bu betik mevcut Excel dosyalarını okuyup tamamlar:
- "kitap listesi.xlsx" -> en az 200 satır
- "ogrenci_listesi.xlsx" -> en az 100 satır
- "odunc listesi.xlsx" -> yukarıdaki verilerden 100 ödünç kaydı üretir

Kullanım:
python3 generate_data.py
"""
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

fake = Faker('tr_TR')

TARGET_BOOKS = 200
TARGET_STUDENTS = 100
TARGET_LOANS = 100

BOOKS_FN = "kitap listesi.xlsx"
STUDENTS_FN = "ogrenci_listesi.xlsx"
LOANS_FN = "odunc listesi.xlsx"


def load_df(path: str):
    if Path(path).exists():
        try:
            return pd.read_excel(path)
        except Exception:
            return pd.DataFrame()
    return pd.DataFrame()


def save_df(df: pd.DataFrame, path: str):
    df.to_excel(path, index=False, engine='openpyxl')
    print(f"Saved {len(df)} rows -> {path}")


def detect_id_col(df: pd.DataFrame, candidates):
    if df is None or df.empty:
        return None
    cols = [c for c in df.columns]
    for cand in candidates:
        for c in cols:
            if cand.lower() in c.lower():
                return c
    # fallback: choose first column that looks like an identifier (numbers or contains 'kod'/'no')
    for c in cols:
        lc = c.lower()
        if any(x in lc for x in ('kod', 'no', 'numara', 'num', 'sıra', 'sira')):
            return c
    # last resort: return first column
    return cols[0] if cols else None


def gen_isbn():
    return ''.join(str(random.randint(0, 9)) for _ in range(13))


BOOK_CATEGORIES = [
    'Roman', 'Bilim', 'Çocuk', 'Tarih', 'Sanat', 'Teknoloji', 'Felsefe', 'Edebiyat', 'Psikoloji'
]


def generate_value_for_column(col_name: str, id_value=None, kind='book', durum_values=None):
    lc = col_name.lower()
    if 'id' in lc or 'kod' in lc or 'no' in lc or 'numara' in lc or 'num' in lc:
        return id_value
    if any(x in lc for x in ('başlık', 'baslik', 'title', 'kitap', 'konu')):
        return fake.sentence(nb_words=random.randint(2, 6)).rstrip('.')
    if any(x in lc for x in ('yazar', 'author', 'yazar_ad', 'yazarad')):
        return fake.name()
    if any(x in lc for x in ('yıl', 'yil', 'year', 'yayin')):
        return random.randint(1950, datetime.now().year)
    if 'isbn' in lc:
        return gen_isbn()
    if any(x in lc for x in ('kategori', 'tür', 'tur')):
        return random.choice(BOOK_CATEGORIES)
    if any(x in lc for x in ('raf', 'shelf', 'konum')):
        return f"R{random.randint(1,10)}-S{random.randint(1,30)}"
    if any(x in lc for x in ('ad', 'isim', 'name')) and kind == 'student':
        return fake.first_name()
    if any(x in lc for x in ('soy', 'soyad', 'surname')) and kind == 'student':
        return fake.last_name()
    if any(x in lc for x in ('sinif', 'sınıf', 'sinîf')) and kind == 'student':
        return random.choice(['9', '10', '11', '12', 'Hazırlık'])
    if any(x in lc for x in ('telefon', 'phone')) and kind == 'student':
        return fake.phone_number()
    if any(x in lc for x in ('eposta', 'email', 'e-posta')) and kind == 'student':
        return fake.ascii_email()
    if any(x in lc for x in ('numara', 'num', 'ogr_no')) and kind == 'student':
        return random.randint(1, 9999)
    if any(x in lc for x in ('verilis', 'veril', 'verilis_tarihi', 'tarih', 'date')):
        # produce a date
        days_ago = random.randint(0, 365)
        return (datetime.now() - timedelta(days=days_ago)).date()
    if any(x in lc for x in ('teslim', 'iade')):
        if random.random() < 0.75:
            return (datetime.now() - timedelta(days=random.randint(0, 300))).date()
        return pd.NaT
    if 'durum' in lc or 'status' in lc:
        if durum_values:
            return random.choice(durum_values)
        return random.choice(['Verildi', 'Teslim edildi', 'Gecikmeli'])
    # default: return a short fake value
    return fake.word()


def generate_rows_for_dataframe(df: pd.DataFrame, target_n: int, kind: str, existing_values_for_col=None):
    # existing_values_for_col: dict[col_name] -> list of observed values (used for durum sampling)
    cols = list(df.columns) if not df.empty else []
    created = []

    # If no columns (file missing or empty), create sensible defaults
    if not cols:
        if kind == 'book':
            cols = ['KitapID', 'Başlık', 'Yazar', 'YayınYılı', 'ISBN']
        else:
            cols = ['OgrenciID', 'Ad', 'Soyad', 'Sinif', 'Telefon', 'Eposta']

    id_col = detect_id_col(df, ['id', 'kod', 'no', 'KitapID', 'OgrenciID']) if not df.empty else None

    # determine starting id if possible
    start_id = None
    if id_col and id_col in df.columns and not df[id_col].dropna().empty:
        try:
            start_id = int(df[id_col].dropna().astype(int).max()) + 1
        except Exception:
            start_id = None

    current_count = len(df)
    to_add = max(0, target_n - current_count)
    for i in range(to_add):
        id_value = (start_id + i) if start_id is not None else (current_count + i + 1)
        row = {}
        for c in cols:
            val = generate_value_for_column(c, id_value if id_col and c == id_col else id_value if ('id' in c.lower() or 'kod' in c.lower()) else None, kind=kind, durum_values=(existing_values_for_col.get('durum') if existing_values_for_col else None))
            # If original df had this column, keep type consistent; else just set
            row[c] = val
        created.append(row)

    if created:
        created_df = pd.DataFrame(created)
        # Keep only original columns order
        if not df.empty:
            created_df = created_df[[c for c in df.columns if c in created_df.columns]]
        return pd.concat([df, created_df], ignore_index=True)
    return df


def sample_dates(n):
    today = datetime.now()
    dates = []
    for _ in range(n):
        days_ago = random.randint(0, 365)
        dates.append(today - timedelta(days=days_ago))
    return dates


def generate_loans(books_df, students_df, existing_loans_df=None, n=100):
    # Decide which columns to use for loan rows
    if existing_loans_df is not None and not existing_loans_df.empty:
        loan_cols = list(existing_loans_df.columns)
        durum_col = detect_id_col(existing_loans_df, ['durum', 'Durum'])
        durum_values = existing_loans_df[durum_col].dropna().unique().tolist() if durum_col and durum_col in existing_loans_df.columns else ['Verildi', 'Teslim edildi', 'Gecikmeli']
    else:
        loan_cols = ['OduncID', 'OgrenciID', 'KitapID', 'VerilisTarihi', 'TeslimTarihi', 'Durum']
        durum_values = ['Verildi', 'Teslim edildi', 'Gecikmeli']

    # Determine identifier columns in books/students
    book_id_col = detect_id_col(books_df, ['id', 'KitapID', 'kod', 'no']) if not books_df.empty else None
    student_id_col = detect_id_col(students_df, ['id', 'OgrenciID', 'kod', 'no']) if not students_df.empty else None

    book_ids = list(books_df[book_id_col].dropna().unique()) if (book_id_col and book_id_col in books_df.columns) else []
    student_ids = list(students_df[student_id_col].dropna().unique()) if (student_id_col and student_id_col in students_df.columns) else []

    if not book_ids and not books_df.empty:
        # try first column values
        book_ids = list(books_df.iloc[:, 0].dropna().unique())
    if not student_ids and not students_df.empty:
        student_ids = list(students_df.iloc[:, 0].dropna().unique())

    # fallback ranges
    if not book_ids:
        book_ids = list(range(1, max(201, len(book_ids) + 1)))
    if not student_ids:
        student_ids = list(range(1, max(101, len(student_ids) + 1)))

    loans = []
    verilis_dates = sample_dates(n)
    # Build lookup maps for Başlık/Yazar and student full name if available
    book_title_col = None
    book_author_col = None
    student_ad_col = None
    student_soyad_col = None
    if not books_df.empty:
        # try common Turkish column names
        for cand in ['başlık', 'baslik', 'title', 'konu']:
            for c in books_df.columns:
                if cand in str(c).lower():
                    book_title_col = c
                    break
            if book_title_col:
                break
        for cand in ['yazar', 'author']:
            for c in books_df.columns:
                if cand in str(c).lower():
                    book_author_col = c
                    break
            if book_author_col:
                break

    if not students_df.empty:
        for cand in ['ad', 'isim', 'name']:
            for c in students_df.columns:
                if cand in str(c).lower():
                    student_ad_col = c
                    break
            if student_ad_col:
                break
        for cand in ['soyad', 'surname']:
            for c in students_df.columns:
                if cand in str(c).lower():
                    student_soyad_col = c
                    break
            if student_soyad_col:
                break

    # maps
    book_map = {}
    if book_id_col and book_title_col and book_author_col and (book_id_col in books_df.columns):
        for _, r in books_df[[book_id_col, book_title_col, book_author_col]].dropna(subset=[book_id_col]).iterrows():
            try:
                bid = r[book_id_col]
                book_map[int(bid)] = (r[book_title_col], r[book_author_col])
            except Exception:
                # non-integer ids possible - store as-is
                book_map[r[book_id_col]] = (r[book_title_col], r[book_author_col])

    student_map = {}
    if student_id_col and student_ad_col and student_soyad_col and (student_id_col in students_df.columns):
        for _, r in students_df[[student_id_col, student_ad_col, student_soyad_col]].dropna(subset=[student_id_col]).iterrows():
            try:
                sid = r[student_id_col]
                student_map[int(sid)] = f"{r[student_ad_col]} {r[student_soyad_col]}"
            except Exception:
                student_map[r[student_id_col]] = f"{r[student_ad_col]} {r[student_soyad_col]}"
    for i in range(n):
        row = {}
        odunc_id = i + 1
        ogr_id = random.choice(student_ids)
        kit_id = random.choice(book_ids)
        verilis = verilis_dates[i]
        teslim_date = None
        if random.random() < 0.75:
            teslim_date = verilis + timedelta(days=random.randint(1, 60))

        for c in loan_cols:
            lc = c.lower()
            if 'odunc' in lc or ('id' in lc and ('odunc' in lc or 'oduncid' in lc or 'odunc_id' in lc)):
                row[c] = odunc_id
            elif any(x in lc for x in ('ogrenci', 'ogrenciid', 'ogrenci_id', 'student')):
                row[c] = ogr_id
            elif any(x in lc for x in ('kitap', 'kitapid', 'book')):
                row[c] = kit_id
            elif any(x in lc for x in ('verilis', 'veril', 'verilis_tarihi', 'tarih', 'date')):
                row[c] = verilis.date()
            elif any(x in lc for x in ('teslim', 'iade')):
                row[c] = (teslim_date.date() if teslim_date is not None else pd.NaT)
            elif 'durum' in lc or 'status' in lc:
                row[c] = random.choice(durum_values)
            elif any(x in lc for x in ('başlık', 'baslik', 'title')):
                # fill from book map if available
                val = None
                try:
                    val = book_map.get(int(kit_id)) if kit_id in book_map or (isinstance(kit_id, int) and int(kit_id) in book_map) else book_map.get(kit_id)
                except Exception:
                    val = book_map.get(kit_id)
                if val:
                    # val is tuple(title, author)
                    row[c] = val[0]
                else:
                    row[c] = generate_value_for_column(c, id_value=None, kind='loan')
            elif any(x in lc for x in ('yazar', 'author')):
                val = None
                try:
                    val = book_map.get(int(kit_id)) if kit_id in book_map or (isinstance(kit_id, int) and int(kit_id) in book_map) else book_map.get(kit_id)
                except Exception:
                    val = book_map.get(kit_id)
                if val:
                    row[c] = val[1]
                else:
                    row[c] = generate_value_for_column(c, id_value=None, kind='loan')
            elif any(x in lc for x in ('ad soyad', 'adsoyad', 'ad_soyad', 'adsoy', 'adsoy')) or (('ad' in lc or 'isim' in lc) and ('soy' in lc or 'soyad' in lc)):
                # combined student name column
                nm = None
                try:
                    nm = student_map.get(int(ogr_id)) if ogr_id in student_map or (isinstance(ogr_id, int) and int(ogr_id) in student_map) else student_map.get(ogr_id)
                except Exception:
                    nm = student_map.get(ogr_id)
                if nm:
                    row[c] = nm
                else:
                    # fallback: try to construct from students_df
                    try:
                        srow = students_df[students_df[student_id_col] == ogr_id]
                        if not srow.empty and student_ad_col and student_soyad_col:
                            row[c] = f"{srow.iloc[0][student_ad_col]} {srow.iloc[0][student_soyad_col]}"
                        else:
                            row[c] = generate_value_for_column(c, id_value=None, kind='loan')
                    except Exception:
                        row[c] = generate_value_for_column(c, id_value=None, kind='loan')
            elif any(x in lc for x in ('personel', 'gorevli', 'görevli', 'person', 'calisan', 'yetkili')):
                row[c] = fake.name()
            else:
                row[c] = generate_value_for_column(c, id_value=None, kind='loan', durum_values=({'durum': durum_values} if durum_values else None))

        loans.append(row)

    return pd.DataFrame(loans)


def ensure_id_column(df: pd.DataFrame, target_col: str, start=1):
    if target_col in df.columns:
        # Fill missing or NaN with sequential ids
        if df[target_col].isnull().any():
            max_existing = int(df[target_col].dropna().max()) if not df[target_col].dropna().empty else start - 1
            for idx in df[df[target_col].isnull()].index:
                max_existing += 1
                df.at[idx, target_col] = max_existing
        return df
    # create new id column
    df.insert(0, target_col, range(start, start + len(df)))
    return df


def main():
    books = load_df(BOOKS_FN)
    students = load_df(STUDENTS_FN)
    loans_existing = load_df(LOANS_FN)

    # Normalize and ensure IDs
    if books.empty:
        books = pd.DataFrame()

    if students.empty:
        students = pd.DataFrame()

    # For existing DataFrames, capture observed 'durum' values if available
    existing_values_books = {}
    existing_values_students = {}
    existing_values_loans = {}
    if not loans_existing.empty:
        if 'Durum' in loans_existing.columns:
            existing_values_loans['durum'] = loans_existing['Durum'].dropna().unique().tolist()
        else:
            dc = detect_id_col(loans_existing, ['durum', 'Durum'])
            if dc and dc in loans_existing.columns:
                existing_values_loans['durum'] = loans_existing[dc].dropna().unique().tolist()

    # Generate/append rows while preserving original columns
    books = generate_rows_for_dataframe(books, TARGET_BOOKS, kind='book')
    students = generate_rows_for_dataframe(students, TARGET_STUDENTS, kind='student')

    # Generate loans using existing loan column layout
    loans_df = generate_loans(books, students, existing_loans_df=loans_existing, n=TARGET_LOANS)

    # Before saving loans, ensure Başlık/Yazar in loans come from kitap listesi.xlsx
    if not loans_df.empty:
        # detect loan title/author column names
        loan_title_cols = [c for c in loans_df.columns if any(x in str(c).lower() for x in ('başlık', 'baslik', 'title'))]
        loan_author_cols = [c for c in loans_df.columns if any(x in str(c).lower() for x in ('yazar', 'author'))]

        # detect a book id column in loans (commonly KitapID or similar)
        loan_book_id_col = None
        for c in loans_df.columns:
            if any(x in str(c).lower() for x in ('kitapid', 'kitap_id', 'kitap', 'bookid', 'book_id')) and c.lower() not in [col.lower() for col in loan_title_cols + loan_author_cols]:
                loan_book_id_col = c
                break

        # build book map from books dataframe (id -> (title, author))
        book_map = {}
        # determine book id column in books_df
        book_id_col = detect_id_col(books_df, ['id', 'KitapID', 'kod', 'no']) if not books_df.empty else None
        # find title/author cols in books_df
        book_title_col = None
        book_author_col = None
        if not books_df.empty:
            for cand in ['başlık', 'baslik', 'title', 'konu']:
                for c in books_df.columns:
                    if cand in str(c).lower():
                        book_title_col = c
                        break
                if book_title_col:
                    break
            for cand in ['yazar', 'author']:
                for c in books_df.columns:
                    if cand in str(c).lower():
                        book_author_col = c
                        break
                if book_author_col:
                    break

        if book_id_col and book_title_col and book_author_col and (book_id_col in books_df.columns):
            for _, r in books_df[[book_id_col, book_title_col, book_author_col]].dropna(subset=[book_id_col]).iterrows():
                key = r[book_id_col]
                try:
                    key = int(key)
                except Exception:
                    pass
                book_map[key] = (r[book_title_col], r[book_author_col])

        # If loan file doesn't have explicit book id column but its title column contains ids, handle that
        # For each loan row, attempt to get book id from loan_book_id_col or from title column if numeric
        for idx, r in loans_df.iterrows():
            # determine book id value for this loan
            bid = None
            if loan_book_id_col and loan_book_id_col in loans_df.columns:
                bid = r[loan_book_id_col]
            else:
                # check first title col if it contains a numeric id
                if loan_title_cols:
                    tval = r[loan_title_cols[0]]
                    try:
                        bid = int(tval)
                    except Exception:
                        # maybe string that matches an id
                        bid = tval

            # try to lookup book data
            bdata = None
            if bid in book_map:
                bdata = book_map[bid]
            else:
                # maybe need to coerce
                try:
                    bdata = book_map.get(int(bid)) if bid is not None else None
                except Exception:
                    bdata = None

            # write title/author columns from bdata when available
            if bdata is not None:
                title_val, author_val = bdata
                for tc in loan_title_cols:
                    loans_df.at[idx, tc] = title_val
                for ac in loan_author_cols:
                    loans_df.at[idx, ac] = author_val

        # Also ensure student name columns in loans use students_df Ad + ' ' + Soyad
        loan_student_name_cols = [c for c in loans_df.columns if any(x in str(c).lower() for x in ('ad soyad', 'adsoyad', 'ad_soyad', 'adsoy', 'ad + soyad'))]
        # detect student id col in loans
        loan_student_id_col = None
        for c in loans_df.columns:
            if any(x in str(c).lower() for x in ('ogrenciid', 'ogrenci_id', 'ogrenci', 'studentid', 'student')):
                loan_student_id_col = c
                break
        # detect ad/soyad cols in students_df
        stud_ad = None
        stud_soyad = None
        if not students_df.empty:
            for cand in ['ad', 'isim', 'name']:
                for c in students_df.columns:
                    if cand in str(c).lower():
                        stud_ad = c
                        break
                if stud_ad:
                    break
            for cand in ['soyad', 'surname']:
                for c in students_df.columns:
                    if cand in str(c).lower():
                        stud_soyad = c
                        break
                if stud_soyad:
                    break

        student_map = {}
        if loan_student_id_col and stud_ad and stud_soyad and loan_student_id_col in students_df.columns:
            # build map from students_df using its id column if matching names
            stud_id_col = detect_id_col(students_df, ['id', 'OgrenciID', 'kod', 'no'])
            if stud_id_col and stud_id_col in students_df.columns:
                for _, r in students_df[[stud_id_col, stud_ad, stud_soyad]].dropna(subset=[stud_id_col]).iterrows():
                    key = r[stud_id_col]
                    try:
                        key = int(key)
                    except Exception:
                        pass
                    student_map[key] = f"{r[stud_ad]} {r[stud_soyad]}"

        for idx, r in loans_df.iterrows():
            sid = None
            if loan_student_id_col and loan_student_id_col in loans_df.columns:
                sid = r[loan_student_id_col]
            if sid in student_map:
                # find any student-name-like columns and set
                for col in loans_df.columns:
                    if any(x in str(col).lower() for x in ('ad soyad', 'adsoyad', 'ad_soyad')) or (('ad' in str(col).lower() or 'isim' in str(col).lower()) and ('soy' in str(col).lower() or 'soyad' in str(col).lower())):
                        loans_df.at[idx, col] = student_map[sid]

    # Save files (overwrite)
    save_df(books, BOOKS_FN)
    save_df(students, STUDENTS_FN)
    save_df(loans_df, LOANS_FN)


if __name__ == '__main__':
    main()
