-- Grain: one row per doctor and month.

select
    dd.doctor_id,
    dd.specialty,
    d.year_month,
    count(*) as consultations,
    round(avg(f.duration_minutes), 2) as avg_duration_minutes,
    round(avg(f.satisfaction_score), 2) as avg_satisfaction,
    round(avg(f.is_referred), 4) as referral_rate
from {{ ref('fct_consultation') }} f
join {{ ref('dim_date') }} d on d.date_key = f.date_key
join {{ ref('dim_doctor') }} dd on dd.doctor_key = f.doctor_key
group by all
