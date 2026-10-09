select
    {{ surrogate_key(['channel_code']) }} as channel_key,
    channel_code,
    channel_name
from (
    values
        ('phone', 'Phone call'),
        ('app', 'In-app chat'),
        ('video', 'Video call'),
        ('other', 'Other')
) as t(channel_code, channel_name)
