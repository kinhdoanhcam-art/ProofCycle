import re


CASES = [
    (
        "K1",
        "Cargo may leave the depot only after the manifest carries a countersignature.",
        "NECESSARY",
    ),
    (
        "K2",
        "A countersignature on the manifest is enough for cargo to leave the depot.",
        "NOT_NECESSARY",
    ),
    (
        "K3",
        "The dispatcher shall countersign the manifest before each quarter closes.",
        "NOT_NECESSARY",
    ),
    (
        "K4",
        "Cargo may not leave the depot without a countersigned manifest; either the dispatcher or the night supervisor may countersign it.",
        "NECESSARY",
    ),
    (
        "K5",
        "Cargo may leave the depot with a countersigned manifest, or with written clearance from the night supervisor instead.",
        "NOT_NECESSARY",
    ),
]


def tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def separates(predicate) -> bool:
    forward = all(
        ("NECESSARY" if predicate(text) else "NOT_NECESSARY") == label
        for _, text, label in CASES
    )
    reverse = all(
        ("NOT_NECESSARY" if predicate(text) else "NECESSARY") == label
        for _, text, label in CASES
    )
    return forward or reverse


all_tokens = set().union(*(tokens(text) for _, text, _ in CASES))
bad_tokens = [token for token in all_tokens if separates(lambda text, token=token: token in tokens(text))]
if bad_tokens:
    raise AssertionError(f"single-token shortcut found: {bad_tokens}")

all_bigrams: set[str] = set()
for _, text, _ in CASES:
    words = re.findall(r"[a-z0-9]+", text.lower())
    all_bigrams |= {f"{words[i]} {words[i + 1]}" for i in range(len(words) - 1)}

bad_bigrams = [
    bigram
    for bigram in all_bigrams
    if separates(
        lambda text, bigram=bigram: bigram
        in " ".join(re.findall(r"[a-z0-9]+", text.lower()))
    )
]
if bad_bigrams:
    raise AssertionError(f"single-bigram shortcut found: {bad_bigrams}")

for metric in (len, lambda text: len(text.split())):
    values = [(metric(text), label) for _, text, label in CASES]
    for threshold in range(min(value for value, _ in values) - 1, max(value for value, _ in values) + 2):
        for direction in ("gt", "lt"):
            predicted = [
                "NECESSARY"
                if ((value > threshold) if direction == "gt" else (value < threshold))
                else "NOT_NECESSARY"
                for value, _ in values
            ]
            if predicted == [label for _, label in values]:
                raise AssertionError("monotone length shortcut found")

print("K1-K5 shortcut resistance: PASS")
