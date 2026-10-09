-- Silver: one clean row per patient.
-- Keeps the latest delivered version, standardizes text, parses both date formats.

with source as (

    select
        upper(trim(patient_id)) as patient_id,
        birth_date,
        gender,
        canton,
        preferred_language,
        insurance_type,
        try_cast(updated_at as timestamp) as updated_at,
        _loaded_at
    from {{ source('bronze', 'raw_patients') }}
    where nullif(trim(patient_id), '') is not null

),

latest as (

    select
        *,
        row_number() over (
            partition by patient_id
            order by updated_at desc nulls last, _loaded_at desc
        ) as row_rank
    from source

),

parsed as (

    select
        patient_id,
        coalesce(
            try_strptime(trim(birth_date), '%Y-%m-%d'),
            try_strptime(trim(birth_date), '%d.%m.%Y')
        )::date as birth_date_raw,
        case upper(trim(gender))
            when 'M' then 'male'
            when 'MALE' then 'male'
            when 'F' then 'female'
            when 'FEMALE' then 'female'
            else 'unknown'
        end as gender,
        nullif(upper(trim(canton)), '') as canton,
        nullif(upper(trim(preferred_language)), '') as preferred_language,
        nullif(lower(trim(insurance_type)), '') as insurance_type,
        updated_at
    from latest
    where row_rank = 1

)

select
    patient_id,
    -- an impossible date becomes null instead of polluting age calculations
    case
        when birth_date_raw between date '1900-01-01' and current_date then birth_date_raw
    end as birth_date,
    gender,
    canton,
    preferred_language,
    insurance_type,
    updated_at
from parsed
