import base64
import os
import sys

DEFAULT_VARS = ["DATABASE_URL", "API_SECRET_KEY", "STRIPE_API_KEY"]


def generate_secret_key(length=32):
    # url-safe, no padding: avoids '=', '#', or quotes that break .env parsing.
    # os.urandom is used instead of the stdlib `secrets` module because this
    # file is named secrets.py and would shadow that import.
    return base64.urlsafe_b64encode(os.urandom(length)).rstrip(b"=").decode()


def init_env_file(dest_path, template_vars):
    if os.path.exists(dest_path):
        print(f"Warning: {dest_path} already exists. Skipping.")
        return

    with open(dest_path, "w", encoding="utf-8") as f:
        for var in template_vars:
            if "SECRET" in var or "KEY" in var or "TOKEN" in var:
                f.write(f"{var}={generate_secret_key()}\n")
            else:
                f.write(f"{var}=\n")
    print(f"Initialized {dest_path} with {len(template_vars)} variables.")


if __name__ == "__main__":
    # Usage: secrets.py [dest_path] [VAR1 VAR2 ...]
    dest = sys.argv[1] if len(sys.argv) > 1 else ".env"
    variables = sys.argv[2:] if len(sys.argv) > 2 else DEFAULT_VARS
    init_env_file(dest, variables)
