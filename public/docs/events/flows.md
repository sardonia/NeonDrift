# Game State Flows (FSM guardrails)

Allowed transitions enforced (warn-once in dev):

- IDLE → COUNTDOWN
- COUNTDOWN → RUNNING • PAUSED
- RUNNING → PAUSED • GAME_OVER • COUNTDOWN
- PAUSED → RUNNING • GAME_OVER
- GAME_OVER → IDLE • COUNTDOWN
