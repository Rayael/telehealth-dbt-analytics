-- Grain: one row per valid consultation.

with consultations as (

    select * from {{ ref('stg_consultations') }}
    where is_valid

),

patients as (

    select patient_key, patient_id, birth_date from {{ ref('dim_patient') }}

),

doctors as (

    select doctor_key, doctor_id from {{ ref('dim_doctor') }}

),

channels as (

    select channel_key, channel_code from {{ ref('dim_channel') }}

),

triage as (

    select triage_key, triage_code from {{ ref('dim_triage_level') }}

),

joined as (

    select
        c.*,
        coalesce(p.patient_key, {{ unknown_key() }}) as patient_key,
        coalesce(d.doctor_key, {{ unknown_key() }}) as doctor_key,
        ch.channel_key,
        coalesce(t.triage_key, {{ unknown_key() }}) as triage_key,
        date_diff('year', p.birth_date, cast(c.started_at as date)) as patient_age
    from consultations c
    left join patients p on p.patient_id = c.patient_id
    left join doctors d on d.doctor_id = c.doctor_id
    left join channels ch on ch.channel_code = c.channel
    left join triage t on t.triage_code = c.triage_code

)

select
    {{ surrogate_key(['consultation_id']) }} as consultation_key,
    consultation_id,
    cast(strftime(cast(started_at as date), '%Y%m%d') as integer) as date_key,
    patient_key,
    doctor_key,
    channel_key,
    triage_key,
    requested_at,
    started_at,
    ended_at,
    duration_minutes,
    wait_minutes,
    satisfaction_score,
    outcome,
    patient_age,
    case
        when patient_age is null then 'unknown'
        when patient_age < 18 then '0-17'
        when patient_age < 40 then '18-39'
        when patient_age < 65 then '40-64'
        else '65+'
    end as patient_age_band,
    cast(outcome = 'referred' as integer) as is_referred,
    cast(outcome = 'emergency_redirect' as integer) as is_emergency_redirect
from joined
