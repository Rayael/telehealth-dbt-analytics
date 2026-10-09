-- Row counts from bronze to gold, one line per consultation flow.
-- The numbers must add up: bronze = duplicates removed + rejected + loaded in the fact.

with bronze as (

    select
        count(*) as bronze_rows,
        count(distinct upper(trim(consultation_id))) as bronze_distinct_ids
    from {{ source('bronze', 'raw_consultations') }}
    where nullif(trim(consultation_id), '') is not null

),

rejected as (

    select count(*) as rejected_rows from {{ ref('dq_rejected_consultations') }}

),

fact as (

    select count(*) as fact_rows from {{ ref('fct_consultation') }}

)

select
    bronze.bronze_rows,
    bronze.bronze_rows - bronze.bronze_distinct_ids as duplicates_removed,
    rejected.rejected_rows,
    fact.fact_rows,
    bronze.bronze_distinct_ids - rejected.rejected_rows - fact.fact_rows as unexplained_rows
from bronze, rejected, fact
