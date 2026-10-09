"""Generate a synthetic telehealth dataset and load it into DuckDB (bronze layer).

All data is fictional. Nothing here comes from a real patient or a real company.

The generator injects typical data quality problems on purpose so that the
silver and gold layers have real work to do:
  - duplicate rows and duplicate keys with different timestamps
  - mixed casing and stray whitespace in categorical columns
  - two date formats (ISO and Swiss DD.MM.YYYY) and a few impossible dates
  - consultations that end before they start
  - consultations pointing at a patient that does not exist
  - out-of-range satisfaction scores

Usage:
    python ingestion/generate_and_load.py --consultations 30000 --seed 42
"""
import argparse
import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb

CANTONS = ["BS", "BL", "ZH", "BE", "AG", "SO", "LU", "GE", "VD", "TI"]
LANGUAGES = ["DE", "FR", "IT", "EN"]
SPECIALTIES = ["General Medicine", "Pediatrics", "Dermatology", "Psychiatry", "Gynecology"]
GENDER_VARIANTS = ["M", "F", "male", "female", "Male", "Female", " m ", " f ", "", "X"]
CHANNEL_VARIANTS = {
    "phone": ["phone", "Phone", "PHONE", "phone "],
    "app": ["app", "App", " app"],
    "video": ["video", "Video", "VIDEO"],
}
OUTCOMES = ["resolved", "prescription", "referred", "emergency_redirect"]
TRIAGE_WAIT = {"T1": (0, 5), "T2": (1, 18), "T3": (2, 45), "T4": (5, 80), "T5": (10, 150)}
TS = "%Y-%m-%d %H:%M:%S"

START = datetime(2024, 1, 1)
END = datetime(2025, 12, 30)


def make_patients(rng, n):
    rows = []
    for i in range(1, n + 1):
        birth = date(1935, 1, 1) + timedelta(days=rng.randint(0, 365 * 85))
        birth_str = birth.isoformat() if rng.random() > 0.15 else birth.strftime("%d.%m.%Y")
        if rng.random() < 0.005:
            birth_str = "0000-00-00"
        canton = rng.choice(CANTONS)
        if rng.random() < 0.1:
            canton = canton.lower()
        updated = START + timedelta(days=rng.randint(0, 300), seconds=rng.randint(0, 86399))
        rows.append({
            "patient_id": f"P{i:06d}",
            "birth_date": birth_str,
            "gender": rng.choice(GENDER_VARIANTS),
            "canton": canton,
            "preferred_language": rng.choice(LANGUAGES),
            "insurance_type": rng.choice(["basic", "Basic", "complementary", "Complementary "]),
            "updated_at": updated.strftime(TS),
        })
    # same patient_id delivered twice, the later row is the right one
    for r in rng.sample(rows, int(n * 0.03)):
        newer = dict(r)
        newer["canton"] = rng.choice(CANTONS)
        newer["updated_at"] = (datetime.strptime(r["updated_at"], TS) + timedelta(days=rng.randint(1, 60))).strftime(TS)
        rows.append(newer)
    rng.shuffle(rows)
    return rows


def make_doctors(rng, n):
    rows = []
    for i in range(1, n + 1):
        specialty = rng.choice(SPECIALTIES)
        if rng.random() < 0.15:
            specialty = specialty.upper()
        rows.append({
            "doctor_id": f"D{i:03d}",
            "specialty": specialty,
            "spoken_language": rng.choice(LANGUAGES),
            "employment_type": rng.choice(["permanent", "permanent", "freelance"]),
            "hire_date": (date(2015, 1, 1) + timedelta(days=rng.randint(0, 3400))).isoformat(),
        })
    return rows


def make_consultations(rng, n, n_patients, n_doctors):
    rows = []
    for i in range(1, n + 1):
        if rng.random() < 0.015:
            patient_id = f"P9{rng.randint(10000, 99999)}"  # does not exist in patients
        else:
            patient_id = f"P{rng.randint(1, n_patients):06d}"
        triage = rng.choices(list(TRIAGE_WAIT), weights=[2, 10, 40, 35, 13])[0]
        if rng.random() < 0.01:
            triage = ""
        lo, hi = TRIAGE_WAIT.get(triage, (1, 40))
        requested = START + timedelta(
            days=rng.randint(0, (END - START).days),
            hours=rng.choices(range(24), weights=[1,1,1,1,1,2,4,8,10,10,9,8,8,8,8,8,9,10,10,8,6,4,2,1])[0],
            minutes=rng.randint(0, 59),
            seconds=rng.randint(0, 59),
        )
        started = requested + timedelta(minutes=rng.randint(lo, hi), seconds=rng.randint(0, 59))
        ended = started + timedelta(minutes=rng.randint(4, 28), seconds=rng.randint(0, 59))
        roll = rng.random()
        if roll < 0.01:
            started, ended = ended, started  # ends before it starts
        elif roll < 0.015:
            started = requested - timedelta(minutes=5)  # starts before the request
        channel = rng.choices(list(CHANNEL_VARIANTS), weights=[25, 45, 30])[0]
        satisfaction = ""
        if rng.random() > 0.35:
            satisfaction = str(rng.choices([1, 2, 3, 4, 5], weights=[3, 5, 12, 35, 45])[0])
            if rng.random() < 0.005:
                satisfaction = rng.choice(["0", "9"])
        outcome = rng.choices(OUTCOMES, weights=[55, 25, 17, 3])[0]
        if rng.random() < 0.1:
            outcome = outcome.upper()
        rows.append({
            "consultation_id": f"C{i:07d}",
            "patient_id": patient_id,
            "doctor_id": f"D{rng.randint(1, n_doctors):03d}",
            "channel": rng.choice(CHANNEL_VARIANTS[channel]),
            "triage_code": triage,
            "requested_at": requested.strftime(TS),
            "started_at": started.strftime(TS),
            "ended_at": ended.strftime(TS),
            "outcome": outcome,
            "satisfaction_score": satisfaction,
        })
    # exact duplicates, as if a file had been delivered twice
    rows.extend(dict(r) for r in rng.sample(rows, int(n * 0.02)))
    rng.shuffle(rows)
    return rows


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--consultations", type=int, default=30000)
    parser.add_argument("--patients", type=int, default=2000)
    parser.add_argument("--doctors", type=int, default=40)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--raw-dir", default="data/raw")
    parser.add_argument("--db", default="telehealth.duckdb")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)

    datasets = {
        "patients": make_patients(rng, args.patients),
        "doctors": make_doctors(rng, args.doctors),
        "consultations": make_consultations(rng, args.consultations, args.patients, args.doctors),
    }
    files = {}
    for name, rows in datasets.items():
        files[name] = raw_dir / f"{name}.csv"
        write_csv(files[name], rows)
        print(f"wrote {len(rows):>6} rows to {files[name]}")

    con = duckdb.connect(args.db)
    con.execute("create schema if not exists bronze")
    for name, path in files.items():
        # all_varchar keeps the raw values untouched, typing happens in silver
        con.execute(
            f"""
            create or replace table bronze.raw_{name} as
            select *, current_timestamp as _loaded_at, ? as _source_file
            from read_csv(?, header = true, all_varchar = true)
            """,
            [path.name, str(path)],
        )
        count = con.execute(f"select count(*) from bronze.raw_{name}").fetchone()[0]
        print(f"loaded {count:>6} rows into bronze.raw_{name}")
    con.close()


if __name__ == "__main__":
    main()
