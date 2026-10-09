-- Silver: one clean row per doctor.

with source as (

    select
        upper(trim(doctor_id)) as doctor_id,
        trim(specialty) as specialty,
        upper(trim(spoken_language)) as spoken_language,
        lower(trim(employment_type)) as employment_type,
        try_cast(hire_date as date) as hire_date,
        _loaded_at
    from {{ source('bronze', 'raw_doctors') }}
    where nullif(trim(doctor_id), '') is not null

),

latest as (

    select
        *,
        row_number() over (partition by doctor_id order by _loaded_at desc) as row_rank
    from source

)

select
    doctor_id,
    -- "DERMATOLOGY" and "Dermatology" are the same specialty
    upper(left(specialty, 1)) || lower(substr(specialty, 2)) as specialty,
    spoken_language,
    employment_type,
    hire_date
from latest
where row_rank = 1
