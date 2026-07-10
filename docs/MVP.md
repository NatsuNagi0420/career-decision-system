# MVP Scope

## Product Goal

Build a working AI career planning loop:

```text
profile input
  -> assessment
  -> capability profile
  -> career/job recommendation
  -> path plan
  -> career report
  -> AI assistant follow-up
```

## P0 Features

1. User login/register
2. Comprehensive profile entry
3. MBTI-style assessment plus extensible assessment model
4. Capability profile generation
5. Job exploration and recommendation
6. Path planning
7. Career report generation and archive
8. AI career assistant
9. Resume upload and analysis

## P1 Features

1. Daily tasks and check-ins
2. Learning resources
3. Interview practice
4. JD analysis
5. Resume to JD matching
6. Android app MVP
7. Admin content management

## P2 Features

1. RAG career knowledge base
2. Advisor workspace
3. Community or mentor matching
4. Long-term growth analytics
5. Advanced notification system

## First Vertical Slice

The first slice should prove the architecture:

```text
web dashboard button
  -> backend report endpoint
  -> agent_server career report endpoint
  -> backend receives structured report
  -> web displays result
```

This confirms frontend/backend/agent boundaries before expanding all pages.
