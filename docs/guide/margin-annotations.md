# Margin Annotations User Guide

AI-powered suggestions that appear in the right margin as you write notes.

## How It Works

1. **Write content** in a note (at least 50 characters)
2. **Pause typing** for 2 seconds
3. **Annotations appear** in the right margin with suggestions, warnings, or insights
4. **Accept or dismiss** each annotation

## Annotation Types

| Type | What It Means |
|------|---------------|
| Suggestion | Ways to improve your writing |
| Warning | Potential issues to address |
| Question | Areas that need clarification |
| Insight | Notable observations about your content |
| Reference | Related resources or links |
| Issue Candidate | Something that could become a tracked issue |

## Testing Examples

### Example 1: Basic Suggestion

**Write this in a note:**
```
The system processes user requests through multiple layers. First it validates
the input then it transforms the data and finally it stores the result in the
database. This happens every time a user submits a form.
```

**Expected annotation:** Suggestion to break into smaller sentences or add punctuation.

---

### Example 2: Warning Detection

**Write this in a note:**
```
We should implement the authentication system without any rate limiting or
input validation to keep the code simple. Users can enter any password they
want without restrictions.
```

**Expected annotation:** Warning about security concerns.

---

### Example 3: Issue Candidate

**Write this in a note:**
```
TODO: The export feature is broken when users have more than 1000 records.
We need to implement pagination for large datasets. This is blocking several
customers from using the product effectively.
```

**Expected annotation:** Issue candidate suggestion to create a tracked issue.

---

### Example 4: Question/Clarification

**Write this in a note:**
```
The API should return data in the new format. We discussed this in the last
meeting but I'm not sure if we decided on JSON or XML. The client team needs
this information soon.
```

**Expected annotation:** Question asking for clarification on the decision.

---

### Example 5: Reference Suggestion

**Write this in a note:**
```
We're implementing OAuth 2.0 for our authentication flow. The authorization
code grant type seems most appropriate for our web application use case.
```

**Expected annotation:** Reference to OAuth 2.0 documentation or best practices.

---

## Using Annotations

### Accept a Suggestion
1. Click on the annotation card in the right margin
2. Review the detailed suggestion in the popover
3. Click **Apply** to accept the suggestion
4. The annotation is marked as accepted

### Dismiss an Annotation
1. Click on the annotation card
2. Click **Dismiss** if the suggestion doesn't apply
3. The annotation is removed from view

### View Confidence Score
Each annotation shows a confidence percentage (e.g., 85%) indicating how certain the AI is about the suggestion.

## Tips

- **Write naturally** - The AI works best with complete thoughts and sentences
- **Give context** - Surrounding paragraphs help the AI understand your intent
- **Review before accepting** - Always verify suggestions make sense for your use case
- **Dismiss freely** - It's okay to dismiss suggestions that don't fit

## Troubleshooting

**Annotations not appearing?**
- Make sure you've written at least 50 characters
- Wait 2 seconds after stopping typing
- Check that the note is not in read-only mode

**Too many annotations?**
- Focus on high-confidence suggestions (85%+)
- Dismiss irrelevant ones to train your preferences
