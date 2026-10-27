#!/usr/bin/env sh
# Prints a 64-char random access key. Save it in your password manager; it is not stored anywhere else.
openssl rand -hex 32
