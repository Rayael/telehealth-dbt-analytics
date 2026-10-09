select
    {{ surrogate_key(['doctor_id']) }} as doctor_key,
    doctor_id,
    coalesce(specialty, 'Unknown') as specialty,
    coalesce(spoken_language, 'UNKNOWN') as spoken_language,
    coalesce(employment_type, 'unknown') as employment_type,
    hire_date
from {{ ref('stg_doctors') }}

union all

select
    {{ unknown_key() }},
    '-1',
    'Unknown',
    'UNKNOWN',
    'unknown',
    null::date
