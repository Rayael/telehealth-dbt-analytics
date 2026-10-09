-- Quarantine table: every consultation kept out of the fact table, with the reason.

select
    consultation_id,
    patient_id,
    doctor_id,
    requested_at,
    started_at,
    ended_at,
    rejection_reason
from {{ ref('stg_consultations') }}
where not is_valid
