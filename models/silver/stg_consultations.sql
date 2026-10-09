-- Silver: one row per consultation, typed and standardized.
-- Invalid rows are not dropped here. They get a rejection_reason and
-- is_valid = false, so nothing disappears silently (see dq_rejected_consultations).

with source as (

    select
        upper(trim(consultation_id)) as consultation_id,
        upper(trim(patient_id)) as patient_id,
        upper(trim(doctor_id)) as doctor_id,
        lower(trim(channel)) as channel_raw,
        nullif(upper(trim(triage_code)), '') as triage_code,
        try_cast(requested_at as timestamp) as requested_at,
        try_cast(started_at as timestamp) as started_at,
        try_cast(ended_at as timestamp) as ended_at,
        lower(trim(outcome)) as outcome_raw,
        try_cast(satisfaction_score as integer) as satisfaction_raw,
        _loaded_at
    from {{ source('bronze', 'raw_consultations') }}
    where nullif(trim(consultation_id), '') is not null

),

deduplicated as (

    select
        *,
        row_number() over (partition by consultation_id order by _loaded_at desc) as row_rank
    from source

),

standardized as (

    select
        consultation_id,
        patient_id,
        doctor_id,
        case
            when channel_raw in ('phone', 'app', 'video') then channel_raw
            else 'other'
        end as channel,
        triage_code,
        requested_at,
        started_at,
        ended_at,
        case
            when outcome_raw in ('resolved', 'prescription', 'referred', 'emergency_redirect') then outcome_raw
            else 'unknown'
        end as outcome,
        case when satisfaction_raw between 1 and 5 then satisfaction_raw end as satisfaction_score
    from deduplicated
    where row_rank = 1

)

select
    *,
    round(date_diff('second', started_at, ended_at) / 60.0, 2) as duration_minutes,
    round(date_diff('second', requested_at, started_at) / 60.0, 2) as wait_minutes,
    case
        when requested_at is null or started_at is null or ended_at is null then 'missing_timestamp'
        when doctor_id is null then 'missing_doctor'
        when ended_at <= started_at then 'end_before_start'
        when started_at < requested_at then 'start_before_request'
    end as rejection_reason,
    case
        when requested_at is null or started_at is null or ended_at is null then false
        when doctor_id is null then false
        when ended_at <= started_at then false
        when started_at < requested_at then false
        else true
    end as is_valid
from standardized
