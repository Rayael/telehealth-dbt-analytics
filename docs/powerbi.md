# Power BI semantic model

The Power BI file itself is not part of this repo. The gold layer is built to be
loaded as is, so this page describes how I would wire it.

## Load

1. Run `python scripts/export_gold.py` (writes CSV and Parquet to `exports/`).
2. In Power BI Desktop: Get data, Parquet (or Text/CSV), pick the `dim_*` and `fct_consultation` files.
   The two `mart_*` tables are optional, they are pre-aggregated versions of the same facts.

## Relationships (star schema, all many-to-one, single direction)

| From (fact) | To (dimension) |
|---|---|
| `fct_consultation[date_key]` | `dim_date[date_key]` |
| `fct_consultation[patient_key]` | `dim_patient[patient_key]` |
| `fct_consultation[doctor_key]` | `dim_doctor[doctor_key]` |
| `fct_consultation[channel_key]` | `dim_channel[channel_key]` |
| `fct_consultation[triage_key]` | `dim_triage_level[triage_key]` |

Mark `dim_date` as the date table (column `date_day`).

## Measures (DAX)

```dax
Consultations = COUNTROWS ( fct_consultation )

Avg Duration (min) = AVERAGE ( fct_consultation[duration_minutes] )

Avg Wait (min) = AVERAGE ( fct_consultation[wait_minutes] )

P90 Wait (min) = PERCENTILE.INC ( fct_consultation[wait_minutes], 0.9 )

Referral Rate = DIVIDE ( SUM ( fct_consultation[is_referred] ), [Consultations] )

Avg Satisfaction = AVERAGE ( fct_consultation[satisfaction_score] )

Consultations PY =
CALCULATE ( [Consultations], SAMEPERIODLASTYEAR ( dim_date[date_day] ) )

Consultations YoY % =
DIVIDE ( [Consultations] - [Consultations PY], [Consultations PY] )
```

## Suggested pages

- Service overview: consultations by month and channel, average and P90 wait, referral rate.
- Quality of service: share within wait target by triage level (use `mart_daily_service_kpis`).
- Doctors: consultations and satisfaction by specialty and month (use `mart_doctor_monthly`).
