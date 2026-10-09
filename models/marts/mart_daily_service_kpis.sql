-- Grain: one row per day and channel. Ready to plug into a Power BI report.

select
    d.date_day,
    d.year_month,
    ch.channel_name,
    count(*) as consultations,
    round(avg(f.duration_minutes), 2) as avg_duration_minutes,
    round(avg(f.wait_minutes), 2) as avg_wait_minutes,
    round(quantile_cont(f.wait_minutes, 0.9), 2) as p90_wait_minutes,
    round(avg(f.is_referred), 4) as referral_rate,
    round(avg(f.satisfaction_score), 2) as avg_satisfaction,
    round(avg(
        case
            when t.max_target_wait_minutes is null then null
            when f.wait_minutes <= t.max_target_wait_minutes then 1.0
            else 0.0
        end
    ), 4) as share_within_wait_target
from {{ ref('fct_consultation') }} f
join {{ ref('dim_date') }} d on d.date_key = f.date_key
join {{ ref('dim_channel') }} ch on ch.channel_key = f.channel_key
join {{ ref('dim_triage_level') }} t on t.triage_key = f.triage_key
group by all
