select
    {{ surrogate_key(['patient_id']) }} as patient_key,
    patient_id,
    birth_date,
    year(birth_date) as birth_year,
    gender,
    coalesce(canton, 'UNKNOWN') as canton,
    coalesce(preferred_language, 'UNKNOWN') as preferred_language,
    coalesce(insurance_type, 'unknown') as insurance_type
from {{ ref('stg_patients') }}

union all

-- unknown member: facts pointing at a patient we never received land here
select
    {{ unknown_key() }},
    '-1',
    null::date,
    null::integer,
    'unknown',
    'UNKNOWN',
    'UNKNOWN',
    'unknown'
