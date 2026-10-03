# Forms — `unstable_FormSignal`

Fields, groups and lists on signals: per-field Standard Schema, validation, async checks through resources, and
submit through a command with server errors spread back onto the fields. **Unstable API** (`unstable_` prefix) — the
contract can change without a major version.

Two plugins, chosen instead of (or next to) `reactHooksPlugin()`:

| Plugin                        | Adds                              |
|-------------------------------|-----------------------------------|
| `unstable_formsPlugin()`      | `api.defineForm`                  |
| `unstable_formsReactPlugin()` | `api.defineForm` + the `useForm` hook |

```tsx
import { z } from "zod/v4";
import {
  createApi,
  unstable_FormSignal as FormSignal,
  unstable_formsReactPlugin,
  useSignal,
} from "@fozy-labs/rx-toolkit";

const f = FormSignal.field;

const api = createApi({ plugins: [unstable_formsReactPlugin()] });
const register = api.createCommand({ queryFn: createUser });

const SignupForm = api.defineForm({
  name: "signup",
  fields: {
    name: f({ schema: z.string().trim().min(1, "Enter a name"), defaultValue: "" }),
    email: f({ schema: z.email("Invalid email"), defaultValue: "" }),
  },
  submit: ({ parsed$ }) => register.bind(parsed$().value),
});

function Signup() {
  const form = SignupForm.useForm();
  const email = useSignal(form.fields.email$);
  const root = useSignal(form.state$);

  return (
    <form onSubmit={(e) => { e.preventDefault(); void form.submit(); }}>
      <input
        value={email.value}
        onChange={(e) => form.fields.email.set(e.target.value)}
        onBlur={form.fields.email.blur}
      />
      {email.visibleErrors[0] && <p>{email.visibleErrors[0].message}</p>}
      <button disabled={!root.canSubmit}>Sign up</button>
    </form>
  );
}
```

- A field schema is any synchronous **Standard Schema** (Zod, Valibot, ArkType) — the form core does not import zod.
  `parsed$()` holds the schema-parsed values (transforms applied).
- A field's errors become visible after `blur()` or a submit attempt (`visibleErrors`), not on every keystroke.
- `submit()` waits for pending async checks, validates, sends `parsed$().value` through the bound command, spreads
  server errors back onto the fields, and on success makes the submitted values the new base (the form is no longer
  dirty).
- `group` nests objects, `list` models repeating rows; `disabled` and validation rules can read other fields' values.
- Standalone, with no plugin: `FormSignal.state(definition)` creates the instance directly; `useForm` needs
  `unstable_formsReactPlugin()`.

When **not** to reach for it: a two-field form with no validation beyond `required` — a plain `Signal.state` plus a
command is less machinery.

The full module docs live in the package repo (`docs/form/`): definition, instance, validation, submit, React.

---

## Pitfalls

- ❌ Reading `field.errors` for display — it holds every issue; the display list is `visibleErrors`.
- ❌ Submitting with `command.execute(...)` by hand — `form.submit()` is what wires validation, async checks and
  server-error mapping together.
- ❌ An async schema (`.refine(async …)`) — field schemas must be synchronous; async checks go through a resource.
- ✅ Two instances of one form share devtools entries — pass a unique `key` per instance (`profile/${id}`).
