#!/bin/sh
# oat-push.sh: reference pusher for the OAT Results metric contract (docs/metrics.md).
#
# Pushes one pipeline step at a time to a Prometheus Pushgateway, so separate CI steps (GitHub
# Actions steps, Tekton tasks) can report without sharing state. POSIX sh plus curl, base64, sed
# and tr: runs in alpine, busybox, curlimages/curl and every common CI runner.
#
#   oat-push.sh run   --image I --tag T --run-id R [--base-image B --base-tag BT] [--run-url U]
#   oat-push.sh check --image I --tag T --run-id R --check C --result pass|warn|fail|skipped
#                     [--duration SECONDS] [--message TEXT]
#   oat-push.sh cve   --image I --tag T --phase before|after --counts critical=1,high=4,...
#   oat-push.sh gate  --image I --tag T --status promoted|blocked|pending
#   oat-push.sh forget --image I [--check C]
#
# Environment:
#   PUSHGATEWAY_URL   default http://localhost:9091
#   OAT_JOB           job label of the pushed groups, default "oat"
#   CURL_OPTS         extra curl options, e.g. "--cacert /etc/ssl/ca.pem" or "-u user:pass"
#
# Grouping keys (each PUT replaces only its own group):
#   run    job=<OAT_JOB>, image                 oat_image_info, oat_run_timestamp_seconds
#   check  job=<OAT_JOB>, image, check          oat_check_result, oat_check_duration_seconds,
#                                               oat_check_info
#   cve    job=<OAT_JOB>-cve, image, phase      image_cve_total
#   gate   job=<OAT_JOB>-gate, image            oat_promotion_status
# A new run of an image replaces the previous run in each group, so the gateway holds the newest
# run per image and Prometheus keeps the history. `forget` deletes an image's groups, or one
# check's group when a check is retired.
set -eu

PUSHGATEWAY_URL="${PUSHGATEWAY_URL:-http://localhost:9091}"
OAT_JOB="${OAT_JOB:-oat}"
CURL_OPTS="${CURL_OPTS:-}"

die() {
  echo "oat-push: $*" >&2
  exit 2
}

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

# Label values in the text exposition format: escape backslash, double quote and newline.
esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'NR>1{printf "\\n"} {printf "%s", $0}'
}

# Grouping key values go in the URL path as base64url, so "/" in image names is safe.
b64() {
  if [ -z "$1" ]; then
    printf '='
  else
    printf '%s' "$1" | base64 | tr -d '\n=' | tr '+/' '-_'
  fi
}

group_url() {
  # group_url JOB key value [key value ...]
  url="${PUSHGATEWAY_URL%/}/metrics/job@base64/$(b64 "$1")"
  shift
  while [ $# -ge 2 ]; do
    url="$url/$1@base64/$(b64 "$2")"
    shift 2
  done
  printf '%s' "$url"
}

push() {
  # push URL BODY: PUT replaces the whole group.
  # shellcheck disable=SC2086
  printf '%s\n' "$2" | curl -fsS $CURL_OPTS -X PUT --data-binary @- "$1" >/dev/null
}

forget() {
  # shellcheck disable=SC2086
  curl -fsS $CURL_OPTS -X DELETE "$1" >/dev/null
}

[ $# -ge 1 ] || usage
cmd="$1"
shift

image="" tag="" run_id="" base_image="" base_tag="" run_url="" check="" result=""
duration="" message="" phase="" counts="" status=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || die "missing value for $1"
  case "$1" in
    --image) image="$2" ;;
    --tag) tag="$2" ;;
    --run-id) run_id="$2" ;;
    --base-image) base_image="$2" ;;
    --base-tag) base_tag="$2" ;;
    --run-url) run_url="$2" ;;
    --check) check="$2" ;;
    --result) result="$2" ;;
    --duration) duration="$2" ;;
    --message) message="$2" ;;
    --phase) phase="$2" ;;
    --counts) counts="$2" ;;
    --status) status="$2" ;;
    *) die "unknown option $1" ;;
  esac
  shift 2
done

[ -n "$image" ] || die "--image is required"
need() {
  for name in "$@"; do
    eval "v=\${$name}"
    # shellcheck disable=SC2154
    [ -n "$v" ] || die "$cmd needs --$(printf '%s' "$name" | tr _ -)"
  done
}

ids="image=\"$(esc "$image")\",tag=\"$(esc "$tag")\",run_id=\"$(esc "$run_id")\""

case "$cmd" in
  run)
    need tag run_id
    body="# TYPE oat_image_info gauge
oat_image_info{$ids,base_image=\"$(esc "$base_image")\",base_tag=\"$(esc "$base_tag")\",run_url=\"$(esc "$run_url")\"} 1
# TYPE oat_run_timestamp_seconds gauge
oat_run_timestamp_seconds{$ids} $(date +%s)"
    push "$(group_url "$OAT_JOB" image "$image")" "$body"
    ;;
  check)
    need tag run_id check result
    case "$result" in
      pass) value=1 ;;
      warn) value=0.5 ;;
      fail) value=0 ;;
      skipped) value=-1 ;;
      *) die "--result must be pass, warn, fail or skipped" ;;
    esac
    labels="$ids,check=\"$(esc "$check")\""
    body="# TYPE oat_check_result gauge
oat_check_result{$labels} $value"
    if [ -n "$duration" ]; then
      body="$body
# TYPE oat_check_duration_seconds gauge
oat_check_duration_seconds{$labels} $duration"
    fi
    if [ -n "$message" ]; then
      body="$body
# TYPE oat_check_info gauge
oat_check_info{$labels,message=\"$(esc "$message")\"} 1"
    fi
    push "$(group_url "$OAT_JOB" image "$image" check "$check")" "$body"
    ;;
  cve)
    need tag phase counts
    case "$phase" in before | after) ;; *) die "--phase must be before or after" ;; esac
    body="# TYPE image_cve_total gauge"
    old_ifs="$IFS"
    IFS=','
    for pair in $counts; do
      severity="${pair%%=*}"
      n="${pair#*=}"
      [ -n "$severity" ] && [ "$severity" != "$pair" ] || die "--counts takes severity=count pairs"
      body="$body
image_cve_total{image=\"$(esc "$image")\",tag=\"$(esc "$tag")\",severity=\"$(esc "$severity")\",phase=\"$phase\"} $n"
    done
    IFS="$old_ifs"
    push "$(group_url "$OAT_JOB-cve" image "$image" phase "$phase")" "$body"
    ;;
  gate)
    need tag status
    case "$status" in
      promoted) value=1 ;;
      pending) value=0.5 ;;
      blocked) value=0 ;;
      *) die "--status must be promoted, blocked or pending" ;;
    esac
    body="# TYPE oat_promotion_status gauge
oat_promotion_status{image=\"$(esc "$image")\",tag=\"$(esc "$tag")\"} $value"
    push "$(group_url "$OAT_JOB-gate" image "$image")" "$body"
    ;;
  forget)
    if [ -n "$check" ]; then
      forget "$(group_url "$OAT_JOB" image "$image" check "$check")"
    else
      forget "$(group_url "$OAT_JOB" image "$image")"
      forget "$(group_url "$OAT_JOB-cve" image "$image" phase before)"
      forget "$(group_url "$OAT_JOB-cve" image "$image" phase after)"
      forget "$(group_url "$OAT_JOB-gate" image "$image")"
    fi
    ;;
  -h | --help | help) usage ;;
  *) die "unknown command $cmd (run, check, cve, gate, forget)" ;;
esac
