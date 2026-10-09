"""Export the gold tables to CSV and Parquet so Power BI can read them.

Usage:
    python scripts/export_gold.py --db telehealth.duckdb --out exports
"""
import argparse
from pathlib import Path

import duckdb

TABLES = [
    "dim_date",
    "dim_patient",
    "dim_doctor",
    "dim_channel",
    "dim_triage_level",
    "fct_consultation",
    "mart_daily_service_kpis",
    "mart_doctor_monthly",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="telehealth.duckdb")
    parser.add_argument("--out", default="exports")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(args.db, read_only=True)
    for table in TABLES:
        con.execute(f"copy gold.{table} to '{out / (table + '.csv')}' (header, delimiter ',')")
        con.execute(f"copy gold.{table} to '{out / (table + '.parquet')}' (format parquet)")
        print(f"exported gold.{table}")
    con.close()


if __name__ == "__main__":
    main()
