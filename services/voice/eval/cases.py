"""Sentences with typical learner mistakes, to check whether Whisper keeps them.

`error` is the wrong phrase as said; `fix` is what a "cleaned-up" transcript would show.
Both are compared after `scoring.normalize`.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Case:
    id: str
    text: str
    error: str
    fix: str


CASES = [
    Case("past-go", "Yesterday I go to the client meeting.", "i go to", "i went to"),
    Case("dont-3rd", "He don't have access to the server.", "he don't", "he doesn't"),
    Case("present-perfect", "We have finished the release last week.", "we have finished", "we finished"),
    Case("since", "I am working here since last year.", "i am working here", "i have been working here"),
    Case("have-has", "The app have three screens.", "app have", "app has"),
    Case("explain-me", "She explained me the problem.", "explained me", "explained the problem to me"),
    Case("discuss-about", "We discussed about the roadmap.", "discussed about", "discussed the roadmap"),
    Case("there-is", "There is many bugs in this version.", "there is many", "there are many"),
    Case("didnt-went", "I didn't went to the daily.", "didn't went", "didn't go"),
    Case("people-is", "People is using the new feature.", "people is", "people are"),
    Case("depends-of", "It depends of the sponsor.", "depends of", "depends on"),
    Case("am-agree", "I am agree with you.", "i am agree", "i agree"),
    Case("informations", "We need more informations about it.", "informations", "information"),
    Case("will-to", "Tomorrow I will to present the project.", "will to present", "will present"),
    Case("users-was", "The users was happy with the update.", "users was", "users were"),
    Case("how-works", "I explained to them how works the app.", "how works the app", "how the app works"),
    Case("said-me", "He said me that the build failed.", "said me", "told me"),
    Case("wait-for", "We are waiting the approval.", "waiting the approval", "waiting for the approval"),
    Case("more-easy", "It's more easy to test now.", "more easy", "easier"),
    Case("me-and", "Me and my team finished the sprint.", "me and my team", "my team and i"),
]
