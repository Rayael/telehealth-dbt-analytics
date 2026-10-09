-- Every valid consultation of silver must be in the fact table, exactly once.
-- Returns rows only when the counts differ.

with silver as (
    select count(*) as n from {{ ref('stg_consultations') }} where is_valid
),

gold as (
    select count(*) as n from {{ ref('fct_consultation') }}
)

select silver.n as silver_rows, gold.n as gold_rows
from silver, gold
where silver.n <> gold.n
