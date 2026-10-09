"""Read the warehouse after `dbt build` and write the JSON files used by the project site.

Output goes to site/data/metrics.json. Run it right after `dbt build`, before
`dbt docs generate`, because it reads target/run_results.json.
"""
import argparse
import json
from collections import Counter
from pathlib import Path

import duckdb


def rows(con, sql):
    cur = con.execute(sql)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def one(con, sql):
    return rows(con, sql)[0]


def test_summary(run_results_path):
    path = Path(run_results_path)
    if not path.exists():
        return None
    results = json.loads(path.read_text())["results"]
    kinds = Counter()
    statuses = Counter()
    warnings = []
    for r in results:
        uid = r["unique_id"]
        kind = uid.split(".")[0]
        kinds[kind] += 1
        if kind in ("test", "unit_test"):
            statuses[r["status"]] += 1
            if r["status"] == "warn":
                warnings.append({"name": uid.split(".")[2], "rows": r.get("failures")})
    return {
        "models": kinds["model"],
        "seeds": kinds["seed"],
        "data_tests": kinds["test"],
        "unit_tests": kinds["unit_test"],
        "passed": statuses["pass"],
        "warned": statuses["warn"],
        "failed": statuses["fail"] + statuses["error"],
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="telehealth.duckdb")
    parser.add_argument("--run-results", default="target/run_results.json")
    parser.add_argument("--out", default="site/data/metrics.json")
    args = parser.parse_args()

    con = duckdb.connect(args.db, read_only=True)

    summary = one(con, """
        select
            count(*) as consultations,
            min(cast(started_at as date)) as first_day,
            max(cast(started_at as date)) as last_day,
            round(avg(wait_minutes), 1) as avg_wait,
            round(quantile_cont(wait_minutes, 0.9), 1) as p90_wait,
            round(avg(duration_minutes), 1) as avg_duration,
            round(avg(satisfaction_score), 2) as avg_satisfaction,
            round(avg(is_referred), 4) as referral_rate,
            round(avg(is_emergency_redirect), 4) as emergency_rate
        from gold.fct_consultation
    """)
    summary["first_day"] = str(summary["first_day"])
    summary["last_day"] = str(summary["last_day"])
    summary["patients"] = one(con, "select count(*) n from gold.dim_patient where patient_id <> '-1'")["n"]
    summary["doctors"] = one(con, "select count(*) n from gold.dim_doctor where doctor_id <> '-1'")["n"]

    reconciliation = one(con, "select * from silver.dq_reconciliation")

    rejected = rows(con, """
        select rejection_reason as reason, count(*) as n
        from silver.dq_rejected_consultations
        group by 1 order by 2 desc
    """)

    unknown_links = one(con, """
        select
            sum(case when patient_key = (select patient_key from gold.dim_patient where patient_id = '-1') then 1 else 0 end) as unknown_patient,
            sum(case when triage_key = (select triage_key from gold.dim_triage_level where triage_code = '-1') then 1 else 0 end) as not_triaged
        from gold.fct_consultation
    """)

    monthly_channel = rows(con, """
        select d.year_month as month, ch.channel_name as channel, count(*) as n
        from gold.fct_consultation f
        join gold.dim_date d on d.date_key = f.date_key
        join gold.dim_channel ch on ch.channel_key = f.channel_key
        group by all order by 1, 2
    """)

    monthly_service = rows(con, """
        select d.year_month as month,
               round(avg(f.wait_minutes), 2) as avg_wait,
               round(quantile_cont(f.wait_minutes, 0.9), 2) as p90_wait,
               round(avg(f.satisfaction_score), 3) as avg_satisfaction,
               round(avg(f.is_referred), 4) as referral_rate
        from gold.fct_consultation f
        join gold.dim_date d on d.date_key = f.date_key
        group by all order by 1
    """)

    wait_by_triage = rows(con, """
        select t.triage_label as label, t.urgency_rank as rank,
               t.max_target_wait_minutes as target,
               count(*) as n,
               round(avg(f.wait_minutes), 1) as avg_wait,
               round(quantile_cont(f.wait_minutes, 0.9), 1) as p90_wait,
               round(avg(case when f.wait_minutes <= t.max_target_wait_minutes then 1.0 else 0.0 end), 4) as share_within_target
        from gold.fct_consultation f
        join gold.dim_triage_level t on t.triage_key = f.triage_key
        where t.triage_code <> '-1'
        group by all order by 2
    """)

    by_hour = rows(con, """
        select hour(requested_at) as hour, count(*) as n
        from gold.fct_consultation group by 1 order by 1
    """)

    by_weekday = rows(con, """
        select d.day_of_week as dow, d.day_name as day, count(*) as n
        from gold.fct_consultation f join gold.dim_date d on d.date_key = f.date_key
        group by all order by 1
    """)

    age_bands = rows(con, """
        select patient_age_band as band, count(*) as n
        from gold.fct_consultation group by 1
        order by case patient_age_band when '0-17' then 1 when '18-39' then 2
                 when '40-64' then 3 when '65+' then 4 else 5 end
    """)

    outcomes = rows(con, """
        select outcome, count(*) as n from gold.fct_consultation group by 1 order by 2 desc
    """)

    specialties = rows(con, """
        select dd.specialty, count(*) as n,
               round(avg(f.duration_minutes), 1) as avg_duration,
               round(avg(f.satisfaction_score), 2) as avg_satisfaction,
               round(avg(f.is_referred), 4) as referral_rate
        from gold.fct_consultation f
        join gold.dim_doctor dd on dd.doctor_key = f.doctor_key
        group by 1 order by 2 desc
    """)

    tables = []
    for schema in ("bronze", "silver", "gold"):
        for t in rows(con, f"""
            select table_name as name, table_type as type
            from information_schema.tables where table_schema = '{schema}' order by 1
        """):
            n = one(con, f'select count(*) n from {schema}."{t["name"]}"')["n"]
            tables.append({"schema": schema, "name": t["name"],
                           "type": "view" if "VIEW" in t["type"] else "table", "rows": n})

    metrics = {
        "summary": summary,
        "reconciliation": reconciliation,
        "rejected": rejected,
        "unknown_links": unknown_links,
        "monthly_channel": monthly_channel,
        "monthly_service": monthly_service,
        "wait_by_triage": wait_by_triage,
        "by_hour": by_hour,
        "by_weekday": by_weekday,
        "age_bands": age_bands,
        "outcomes": outcomes,
        "specialties": specialties,
        "tables": tables,
        "tests": test_summary(args.run_results),
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(metrics, indent=1, default=str))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
