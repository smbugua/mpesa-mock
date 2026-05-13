# Python Flask example

mpesa-mock is HTTP, so it's framework-agnostic. This shows the same flow in Flask.

```bash
# terminal 1
npx mpesa-mock --delay 2000

# terminal 2
pip install -r requirements.txt
python app.py

# terminal 3
python send_stk.py                # success (suffix 00)
python send_stk.py 254712345602   # insufficient funds
python send_stk.py 254712345604   # timeout (no callback fires)
```

Watch the Flask logs for the `[callback]` line.
