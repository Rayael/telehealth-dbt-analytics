with days as (

    select cast(d as date) as date_day
    from generate_series(date '2024-01-01', date '2025-12-31', interval 1 day) as t(d)

)

select
    cast(strftime(date_day, '%Y%m%d') as integer) as date_key,
    date_day,
    year(date_day) as year,
    quarter(date_day) as quarter,
    month(date_day) as month,
    strftime(date_day, '%B') as month_name,
    strftime(date_day, '%Y-%m') as year_month,
    weekofyear(date_day) as iso_week,
    isodow(date_day) as day_of_week,
    strftime(date_day, '%A') as day_name,
    isodow(date_day) in (6, 7) as is_weekend
from days
