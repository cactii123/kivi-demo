#!/usr/bin/env python3
"""
Generates data/corpus.json: ~500 synthetic transcript-like records used to
develop and stress-test KIVI's retrieval / tone / glossary logic before
those rules ran against real usage.

Every record carries the same fields the live app's decision ledger would
produce, so the corpus can be inspected with the same questions the spec
asks for: what was the input, what memory did it touch, what's the
provenance of that memory, what did Kivi do, and why.
"""
import json
import random
from datetime import datetime, timedelta

random.seed(42)

LANGUAGES = ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN", "hinglish"]
PEOPLE = ["Rohan", "Ananya", "Vivek", "Meera", "the design team", "my manager", "Priya", "the vendor", "Arjun", "Kavya"]
PROJECTS = ["Q3 rollout", "Saaras integration", "the Bengaluru launch", "the onboarding flow", "Project Kivi", "the vendor contract", "the demo deck", "the hiring pipeline"]
MISHEARD_TERMS = [("Saaras", "sourus"), ("Bhashini", "bashini"), ("Kivi", "kiwi"), ("Sarvam", "servum"), ("Ananya", "anania")]

DICTATION_TEMPLATES = [
    "um so {person} asked about {project} and I think we should {action} by {day}",
    "note to self, {project} needs a follow up with {person}, {filler} maybe tomorrow",
    "quick thought — {project} timeline is slipping, need to tell {person} before the {meeting}",
    "reminder, call {person} about {project} sometime {timeref}",
    "{person} mentioned {project} is blocked on the vendor, escalate this week",
    "draft for {person}: {project} update, we shipped the first milestone",
    "idea for {project} — what if we {action} instead of {action2}",
]
ACTIONS = ["ship the beta early", "push the deadline", "loop in legal", "cut the scope", "get budget signoff", "reassign the ticket"]
FILLERS = ["like", "you know", "actually", "basically", "kind of"]
MEETINGS = ["standup", "review", "client call", "all hands", "1:1"]
TIMEREFS = ["this evening", "before lunch", "around 5pm", "first thing tomorrow", "end of day"]
DAYS = ["Monday", "Wednesday", "Friday", "next week", "tomorrow"]

HINDI_MIX = [
    "yaar {project} ka kaam thoda slow chal raha hai, {person} se baat karni hai",
    "kal {timeref} {person} ne bola {project} ready hoga",
    "ek reminder set karo, {project} follow up {day} ko",
]
KANNADA_MIX = [
    "{project} bagge {person} jothe matadbeku {timeref}",
    "ivattu {project} update kalisidini, nale review ide",
]

HEYKIVI_FIND_TEMPLATES = [
    "hey kivi find the dictation from {timeref} yesterday and polish it for the {meeting}",
    "kivi pull up what I said {timeref} about {project} and clean it up for the {meeting}",
    "get the note I took {timeref} today and make it ready for {person}",
    "find what I dictated {timeref} and polish it, I'm walking into the {meeting}",
]
HEYKIVI_TONE_TEMPLATES = [
    "that's too formal for {person}, make it more casual",
    "keep it professional, this is going to {person}",
    "too stiff, {person} and I are casual",
    "make it more formal, it's for {person}",
]
HEYKIVI_RECALL_TEMPLATES = [
    "what was the last thing I said about {project}",
    "when did I last talk to {person} about {project}",
    "what was the first note I made yesterday",
]
HEYKIVI_TEACH_TEMPLATES = [
    "no I meant {correct}, not {wrong}",
    "it's {correct}, you keep hearing {wrong}",
]

MODELS_ASR = ["saaras-v3-streaming", "saarika-v2.5", "whisper-large-v3-finetune"]
MODELS_GEN = ["kivi-polish-v1-local", "indic-llm-chat-v2", "none"]


def rand_time(days_back=30):
    now = datetime.now()
    dt = now - timedelta(days=random.uniform(0, days_back), hours=random.uniform(-3, 3))
    # bias towards working hours
    hour = random.choice(list(range(8, 21)))
    dt = dt.replace(hour=hour, minute=random.randint(0, 59), second=0, microsecond=0)
    return dt


def inject_asr_noise(clean_text, language):
    """Simulate a raw ASR pass: dropped punctuation, occasional mishears,
    filler retention, lowercase-only output — this is what a real ASR
    engine would hand upstream before any LLM formatting cleans it up."""
    text = clean_text.lower()
    text = text.replace(",", "").replace(".", "")
    if random.random() < 0.35:
        text = random.choice(FILLERS) + " " + text
    for wrong, right in [(b, a) for a, b in MISHEARD_TERMS]:
        pass
    for correct, misheard in MISHEARD_TERMS:
        if correct.lower() in text and random.random() < 0.4:
            text = text.replace(correct.lower(), misheard)
    if language != "en-IN" and random.random() < 0.5:
        text += " " + random.choice(["na", "yaar", "guys", "okay"])
    return text


def make_dictation_record(i):
    ts = rand_time()
    language = random.choice(LANGUAGES)
    template_pool = DICTATION_TEMPLATES
    if language == "hi-IN" or language == "hinglish":
        template_pool = DICTATION_TEMPLATES + HINDI_MIX
    elif language == "kn-IN":
        template_pool = DICTATION_TEMPLATES + KANNADA_MIX

    tmpl = random.choice(template_pool)
    person = random.choice(PEOPLE)
    project = random.choice(PROJECTS)
    clean = tmpl.format(
        person=person, project=project, action=random.choice(ACTIONS),
        action2=random.choice(ACTIONS), filler=random.choice(FILLERS),
        day=random.choice(DAYS), meeting=random.choice(MEETINGS),
        timeref=random.choice(TIMEREFS),
    )
    clean = clean[0].upper() + clean[1:]
    if not clean.endswith("."):
        clean += "."
    raw = inject_asr_noise(clean, language)

    entities = [p for p in [person] if p[0].isupper()] + [w for w in project.split() if w[0].isupper()]
    asr_ms = random.randint(120, 420)
    fmt_ms = random.randint(60, 180)

    # candidate signal noticed, but per the product's rule this NEVER
    # becomes confirmed memory from a single dictation
    memory_action = "candidate_noticed" if entities else "none"

    return {
        "id": f"corpus_{i:04d}",
        "timestamp": ts.isoformat(),
        "mode": "dictation",
        "language": language,
        "raw_asr": raw,
        "llm_formatted": clean,
        "entities": entities,
        "memory_action": memory_action,
        "memory_provenance": (
            {"signal": "single mention", "status": "candidate", "note": "not written to confirmed memory; needs repetition or explicit confirmation"}
            if memory_action == "candidate_noticed" else None
        ),
        "reason": (
            f"Noticed {', '.join(entities)} in passing — logged as a candidate signal only, dictation output is unaffected."
            if entities else "No proper nouns or recurring terms detected; nothing logged."
        ),
        "latency_ms": asr_ms + fmt_ms,
        "latency_breakdown": {"asr_ms": asr_ms, "light_format_ms": fmt_ms},
        "cost_usd": round(0.00002 * len(raw) + 0.000005 * len(clean), 6),
        "model_used": random.choice(MODELS_ASR),
    }


def make_heykivi_record(i, tone_state):
    ts = rand_time()
    kind = random.choices(
        ["find_and_polish", "tone_feedback", "recall", "teach", "ambiguous_find", "no_match"],
        weights=[30, 20, 15, 10, 15, 10], k=1,
    )[0]
    language = random.choice(["en-IN", "hinglish"])
    person = random.choice(PEOPLE)
    project = random.choice(PROJECTS)
    meeting = random.choice(MEETINGS)
    timeref = random.choice(TIMEREFS)

    asr_ms = random.randint(120, 300)
    intent_ms = random.randint(10, 40)
    retrieval_ms = random.randint(5, 30)
    gen_ms = random.randint(180, 500)

    if kind == "find_and_polish":
        clean = random.choice(HEYKIVI_FIND_TEMPLATES).format(timeref=timeref, project=project, meeting=meeting, person=person)
        source_id = f"corpus_{random.randint(0, i - 1):04d}" if i > 0 else None
        tone_key = person if person in tone_state else meeting
        tone = tone_state.get(tone_key)
        reason_bits = [f"Matched a dictation {timeref} yesterday about {project} with a single clear best score."]
        if tone:
            reason_bits.append(f"Applied the '{tone}' tone already confirmed for '{tone_key}'.")
        else:
            reason_bits.append(f"No confirmed tone for '{tone_key}' yet — used a neutral default instead of guessing.")
        memory_action = "retrieved_and_polished"
        memory_used = [{"key": tone_key, "value": tone}] if tone else []
        cost = round(0.02 * len(clean) / 1000 + 0.00003 * len(clean), 6)
        model = random.choice(MODELS_GEN[:2])
    elif kind == "ambiguous_find":
        clean = random.choice(HEYKIVI_FIND_TEMPLATES).format(timeref="around 5pm", project=project, meeting=meeting, person=person)
        reason_bits = ["Found two dictations within the same time window with near-identical topic scores — asked which one instead of guessing."]
        memory_action = "asked_clarification"
        memory_used = []
        source_id = None
        cost = 0.0
        model = "none"
    elif kind == "no_match":
        clean = f"kivi find the dictation from {timeref} about {random.choice(['the merger', 'the lawsuit', 'the acquisition'])}"
        reason_bits = ["No dictation matched the requested time window and topic closely enough to act on — reported the miss rather than returning a weak guess."]
        memory_action = "rejected_low_confidence"
        memory_used = []
        source_id = None
        cost = 0.0
        model = "none"
    elif kind == "tone_feedback":
        clean = random.choice(HEYKIVI_TONE_TEMPLATES).format(person=person)
        direction = "casual" if "casual" in clean else "formal"
        prev = tone_state.get(person)
        tone_state[person] = direction
        confirmed = prev == direction
        reason_bits = [
            f"Read this as tone feedback for '{person}' ({direction})." ,
            ("Second consistent correction — now confirmed and will be applied automatically." if confirmed
             else "First correction for this audience — recorded as a candidate, not yet trusted enough to apply silently."),
        ]
        memory_action = "tone_learned" if confirmed else "tone_candidate"
        memory_used = [{"key": person, "value": direction, "status": "confirmed" if confirmed else "candidate"}]
        source_id = None
        cost = 0.0
        model = "none"
    elif kind == "teach":
        correct, wrong = random.choice(MISHEARD_TERMS)
        clean = f"no I meant {correct}, not {wrong}"
        reason_bits = [f"Explicit correction — the strongest possible signal, so '{correct}' is added to the glossary immediately."]
        memory_action = "glossary_taught"
        memory_used = [{"key": wrong, "value": correct, "status": "confirmed"}]
        source_id = None
        cost = 0.0
        model = "none"
    else:  # recall
        clean = random.choice(HEYKIVI_RECALL_TEMPLATES).format(project=project, person=person)
        reason_bits = ["Simple recall answered directly from dictation history — no memory write involved."]
        memory_action = "none"
        memory_used = []
        source_id = f"corpus_{random.randint(0, i - 1):04d}" if i > 0 else None
        cost = 0.0
        model = "none"

    raw = inject_asr_noise(clean, language)
    total_ms = asr_ms + intent_ms + retrieval_ms + (gen_ms if kind == "find_and_polish" else 0)

    return {
        "id": f"corpus_{i:04d}",
        "timestamp": ts.isoformat(),
        "mode": "hey-kivi",
        "language": language,
        "raw_asr": raw,
        "llm_formatted": clean,
        "entities": [person] if person[0].isupper() else [],
        "memory_action": memory_action,
        "memory_provenance": memory_used if memory_used else None,
        "source_take_id": source_id,
        "reason": " ".join(reason_bits),
        "latency_ms": total_ms,
        "latency_breakdown": {"asr_ms": asr_ms, "intent_ms": intent_ms, "retrieval_ms": retrieval_ms, "generation_ms": gen_ms if kind == "find_and_polish" else 0},
        "cost_usd": cost,
        "model_used": model,
    }


def main(n=500):
    records = []
    tone_state = {}
    n_dictation = int(n * 0.62)
    n_heykivi = n - n_dictation

    for i in range(n_dictation):
        records.append(make_dictation_record(i))
    for j in range(n_heykivi):
        records.append(make_heykivi_record(n_dictation + j, tone_state))

    records.sort(key=lambda r: r["timestamp"])

    with open("data/corpus.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=1)

    # summary
    by_mode = {}
    by_action = {}
    total_cost = 0.0
    for r in records:
        by_mode[r["mode"]] = by_mode.get(r["mode"], 0) + 1
        by_action[r["memory_action"]] = by_action.get(r["memory_action"], 0) + 1
        total_cost += r["cost_usd"]

    print(f"generated {len(records)} records -> data/corpus.json")
    print("by mode:", by_mode)
    print("by memory_action:", by_action)
    print(f"total simulated cost across corpus: ${total_cost:.4f}")


if __name__ == "__main__":
    main(500)
