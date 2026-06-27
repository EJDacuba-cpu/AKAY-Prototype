# AKAY Standard Flowcharts

This document describes the implemented AKAY workflows using standard flowchart conventions in Mermaid syntax. It is intended for capstone documentation and defense. This file is documentation only.

## 1. Overall AKAY System Flow

This flow shows the full BHC-to-RHU coordination path. Detailed steps are delegated to module-level flowcharts through off-page connectors.

```mermaid
flowchart TD
    START([Start])
    A["BHC/BHW creates patient or selects existing patient"]
    OFF_HR[[Off-page Connector: Add Health Record Flow]]
    B["System stores health record"]
    DB1[(AKAY Database)]
    C{"Referral needed?"}
    D[/Health record saved without referral/]
    OFF_REF[[Off-page Connector: Referral Creation Flow]]
    E["RHU receives incoming referral"]
    OFF_QR[[Off-page Connector: RHU QR Scanner Flow]]
    F["RHU checks in patient"]
    G["RHU processes referral"]
    H{"Return slip / feedback supported?"}
    I["RHU submits return slip / feedback"]
    J["Backend stores feedback and updates referral"]
    DB2[(AKAY Database)]
    OFF_NOTIF[[Off-page Connector: Notification Flow]]
    END([End])

    START --> A --> OFF_HR --> B --> DB1 --> C
    C -- "No" --> D --> END
    C -- "Yes" --> OFF_REF --> E --> OFF_QR --> F --> G --> H
    H -- "Yes" --> I --> J --> DB2 --> OFF_NOTIF --> END
    H -- "No" --> END
```

Connector notes:
- Off-page connector to Add Health Record Flow: details the health record form.
- Off-page connector to Referral Creation Flow: details referral submission and QR generation.
- Off-page connector to RHU QR Scanner Flow: details QR/manual verification and check-in.
- Off-page connector to Notification Flow: details implemented notifications.

## 2. Add Health Record Flow

This flow uses the BHC health record form. New records default to Initial Consultation. Classification determines which form section appears, while status determines monitoring or closure.

```mermaid
flowchart TD
    START([Start])
    A["Open Add Health Record page"]
    B[/Select patient/]
    C{"Patient selected?"}
    D[/Show validation message/]
    CONN_A((A))
    E["Set Visit Type = Initial Consultation"]
    F[/Select Classification/]
    G{"Classification valid for patient?"}
    H[/Show invalid classification modal/]
    I{"Maternal + male patient?"}
    J["Reset classification-specific fields"]
    K["Show selected classification form section"]
    L[/Fill clinical details/]
    M[/Fill vital signs/]
    N[/Select status/]
    O{"Status = Follow-up Required?"}
    P[/Require follow-up date/]
    Q["Prepare health record payload"]
    R["Save health record"]
    S[(Health Records)]
    T[/Show success modal/]
    U{"Create Referral if Needed?"}
    OFF_REF[[Off-page Connector: Referral Creation Flow]]
    V["Go back to Health Records"]
    END([End])

    START --> A --> B --> C
    C -- "No" --> D --> CONN_A --> B
    C -- "Yes" --> E --> F --> I
    I -- "Yes" --> J --> H --> CONN_A
    I -- "No" --> G
    G -- "No" --> H --> CONN_A
    G -- "Yes" --> K --> L --> M --> N --> O
    O -- "Yes" --> P --> Q
    O -- "No" --> Q
    Q --> R --> S --> T --> U
    U -- "Yes" --> OFF_REF
    U -- "No" --> V --> END
```

Connector notes:
- On-page connector A returns the user to patient or classification selection after a validation issue.
- Off-page connector to Referral Creation Flow is available after saving a new non-Completed BHC health record.
- Maternal + male patient invalid classification modal is implemented.
- Immunization + adult confirmation modal was not found in the current code.

## 3. Follow-up Visit Flow

This flow starts from an existing health record whose status is Follow-up Required. The follow-up visit is stored as a new health record linked to the original record.

```mermaid
flowchart TD
    START([Start])
    A["Existing health record has status Follow-up Required"]
    B{"How does BHW find record?"}
    C["Use Health Records filters"]
    D["Open Patient Details"]
    E["Open full Health Record Details"]
    F[/Click Record Follow-up Visit/]
    G["System opens follow-up form"]
    H["Patient selection is hidden or locked"]
    I["Set Visit Type = Follow-up Visit"]
    J["Link original health record ID"]
    DB1[(Original Health Record)]
    CONN_B((B))
    K[/Fill follow-up assessment/]
    L[/Select new status/]
    M{"New status = Follow-up Required?"}
    N[/Set next follow-up date/]
    O["Save follow-up visit"]
    P["Backend validates original record is Follow-up Required"]
    Q{"Validation passed?"}
    R[/Show validation error/]
    S[(New Health Record)]
    T{"Original fulfillment stored?"}
    U["Fulfillment inferred by linked follow-up child record"]
    V[/Show success modal/]
    W{"Create Referral if Needed?"}
    OFF_REF[[Off-page Connector: Referral Creation Flow]]
    END([End])

    START --> A --> B
    B -- "Health Records" --> C --> E
    B -- "Patient Details" --> D --> E
    E --> F --> G --> H --> I --> J --> DB1 --> CONN_B
    CONN_B --> K --> L --> M
    M -- "Yes" --> N --> O
    M -- "No" --> O
    O --> P --> Q
    Q -- "No" --> R --> END
    Q -- "Yes" --> S --> T
    T -- "No backend fulfilled flag" --> U --> V
    T -- "Supported in future" --> V
    V --> W
    W -- "Yes" --> OFF_REF
    W -- "No" --> END
```

Connector notes:
- On-page connector B keeps the long setup readable before the assessment section.
- Off-page connector to Referral Creation Flow is optional after the follow-up is saved if the record is allowed to create a referral.
- The current backend stores the new linked health record, but it does not store a separate fulfilled flag on the original record.

## 4. Referral Creation Flow

This flow starts after a health record is saved. The referral is stored separately from health record status and receives its own tracking ID and QR value.

```mermaid
flowchart TD
    START([Start])
    A["Start from saved health record"]
    B["System loads patient and health record context"]
    C[(Health Record)]
    D{"Existing referral linked to record?"}
    E[/Open existing referral details/]
    F{"Active referral exists for patient?"}
    G[/Show active referral warning/]
    CONN_C((C))
    H[/User fills referral details/]
    I["System prepares referral payload"]
    J["Backend generates tracking ID"]
    K["Backend generates QR code value"]
    L["Save referral"]
    M[(Referrals)]
    N[/Show success result/]
    O["Referral appears in BHC Referrals"]
    P["Referral appears in RHU Incoming Referrals"]
    Q{"Print referral slip?"}
    R[/Generate printable slip with QR code/]
    OFF_INCOMING[[Off-page Connector: RHU Incoming Referral Flow]]
    OFF_QR[[Off-page Connector: RHU QR Scanner Flow]]
    END([End])

    START --> A --> B --> C --> D
    D -- "Yes" --> E --> END
    D -- "No" --> F
    F -- "Yes" --> G --> CONN_C
    F -- "No" --> CONN_C
    CONN_C --> H --> I --> J --> K --> L --> M --> N
    N --> O --> P --> Q
    Q -- "Yes" --> R --> OFF_INCOMING --> OFF_QR --> END
    Q -- "No" --> OFF_INCOMING --> END
```

Connector notes:
- On-page connector C merges normal referral creation and the active-referral warning path.
- Off-page connector to RHU Incoming Referral Flow shows the RHU queue path.
- Off-page connector to RHU QR Scanner Flow shows printed-slip verification.

## 5. RHU Incoming Referral Flow

This flow shows how RHU staff access only referrals assigned to their RHU facility.

```mermaid
flowchart TD
    START([Start])
    A["RHU opens Incoming Referrals"]
    B["System fetches referrals assigned to RHU facility"]
    C[(Referrals)]
    D{"Referrals found?"}
    E[/Show empty state/]
    F[/Show referral list/]
    G[/RHU clicks View Details/]
    H["Backend verifies referral assignment"]
    I{"Referral assigned to current RHU?"}
    J[/Show unauthorized message/]
    K[/Show Referral Details/]
    END([End])

    START --> A --> B --> C --> D
    D -- "No" --> E --> END
    D -- "Yes" --> F --> G --> H --> I
    I -- "No" --> J --> END
    I -- "Yes" --> K --> END
```

Connector notes:
- Database symbol represents stored referrals returned through backend facility scoping.
- Decision symbols separate empty queue and unauthorized access states.

## 6. RHU QR Scanner Verification Flow

This flow covers camera scanning and manual verification. The frontend normalizes the scanned or entered value, and the backend verifies both existence and facility assignment.

```mermaid
flowchart TD
    START([Start])
    A["RHU opens QR Scanner"]
    B{"Verification mode?"}
    C["Start camera"]
    D{"Camera permission granted?"}
    E[/Show camera permission message/]
    F[/Scan QR code/]
    G[/Enter tracking ID manually/]
    CONN_D((D))
    H["System normalizes QR or tracking ID"]
    I{"Tracking ID extracted?"}
    J[/Show invalid QR or tracking ID message/]
    K["Backend verifies referral"]
    L[(Referrals)]
    M{"Referral found?"}
    N[/Show not found message/]
    O{"Referral assigned to current RHU?"}
    P[/Show not assigned message/]
    Q[/Show referral result/]
    R{"Check-in patient?"}
    S["Update referral status to Received"]
    T[(Referral Status Update)]
    U[/Show checked-in confirmation/]
    OFF_DETAILS[[Off-page Connector: Referral Details Flow]]
    OFF_NOTIF[[Off-page Connector: Notification Flow]]
    END([End])

    START --> A --> B
    B -- "Scan with Camera" --> C --> D
    D -- "No" --> E --> END
    D -- "Yes" --> F --> CONN_D
    B -- "Manual Verification" --> G --> CONN_D
    CONN_D --> H --> I
    I -- "No" --> J --> END
    I -- "Yes" --> K --> L --> M
    M -- "No" --> N --> END
    M -- "Yes" --> O
    O -- "No" --> P --> END
    O -- "Yes" --> Q --> R
    R -- "No" --> OFF_DETAILS --> END
    R -- "Yes" --> S --> T --> U --> OFF_NOTIF --> OFF_DETAILS --> END
```

Connector notes:
- On-page connector D joins camera and manual verification into one verification path.
- Off-page connector to Referral Details Flow continues to the detailed referral page.
- Off-page connector to Notification Flow represents the BHC notification after Received status.

## 7. Notification Flow

Implemented notifications are created in the backend `notifications` table and shown through the frontend notification dropdown or inbox. Planned items are separated clearly.

### Implemented Notifications

```mermaid
flowchart TD
    START([Start])
    A{"Notification event exists?"}
    B["Admin creates user account"]
    C["Backend creates Account created notification"]
    D["BHC creates referral"]
    E["Backend notifies active RHU users at receiving facility"]
    F["RHU updates referral status"]
    G{"Status = Received?"}
    H["Backend notifies BHC creator: Patient checked in at RHU"]
    I["Backend notifies BHC creator: Referral status updated"]
    J["RHU submits feedback / return slip"]
    K["Backend notifies BHC creator: Feedback submitted"]
    L[(Notifications)]
    M[/User views notification dropdown or inbox/]
    END([End])

    START --> A
    A -- "Account created" --> B --> C --> L
    A -- "New referral submitted" --> D --> E --> L
    A -- "Referral status changed" --> F --> G
    G -- "Yes" --> H --> L
    G -- "No" --> I --> L
    A -- "Feedback submitted" --> J --> K --> L
    L --> M --> END
```

### Planned / Not Yet Implemented Notifications

```mermaid
flowchart TD
    START([Start])
    A{"Planned notification event?"}
    B["Follow-up due today"]
    C[/Planned / Not yet implemented/]
    D["Overdue follow-up"]
    E[/Planned / Not yet implemented/]
    F["Referral accepted as a separate status"]
    G[/Planned / Not yet implemented/]
    END([End])

    START --> A
    A -- "Follow-up due today" --> B --> C --> END
    A -- "Overdue follow-up" --> D --> E --> END
    A -- "Referral accepted" --> F --> G --> END
```

Connector notes:
- Implemented notifications use the database symbol for stored notification records.
- New incoming referral and return slip submitted notifications are implemented in the current backend.
- Follow-up due, overdue follow-up, and separate referral accepted notifications were not found as implemented backend notifications.

## 8. Patient Details Flow

This flow shows how a BHC user reviews patient information, opens health records, and reaches follow-up recording through the full Health Record Details page.

```mermaid
flowchart TD
    START([Start])
    A["Open Patient Details"]
    B["System loads patient profile"]
    C[(Patient)]
    D[/Show patient profile/]
    E["System loads health record history"]
    F[(Health Records)]
    G["System loads referral history"]
    H[(Referrals)]
    I[/Show latest consultation link/]
    J[/Show Health Records tab/]
    K[/Show Referral History tab/]
    L{"User clicks latest consultation?"}
    M[[Off-page Connector: Health Record Details Flow]]
    N{"User clicks Record Follow-up Visit?"}
    O[[Off-page Connector: Follow-up Visit Flow]]
    P{"User opens referral history item?"}
    Q[[Off-page Connector: Referral Details Flow]]
    END([End])

    START --> A --> B --> C --> D
    D --> E --> F --> I --> J
    D --> G --> H --> K
    J --> L
    L -- "Yes" --> M --> N
    L -- "No" --> P
    N -- "Yes, from Health Record Details" --> O --> END
    N -- "No" --> P
    P -- "Yes" --> Q --> END
    P -- "No" --> END
```

Connector notes:
- Off-page connector to Health Record Details Flow is used because Patient Details links to the full record.
- Off-page connector to Follow-up Visit Flow is reached after opening a Follow-up Required health record.
- Off-page connector to Referral Details Flow is used for referral history items.

## Flowchart Connector Legend

- On-page connector A, B, C, D = continuation within the same flowchart.
- Off-page connector = continuation to another flowchart, module, or page.
- Decision = Yes/No condition or branching condition.
- Database = stored system data.
- Terminator = Start or End.
- Process = user or system action.
- Input/Output = user input, validation message, modal, or displayed result.

## Key AKAY Workflow Rules

- Every visit/check-up creates one health record.
- Follow-up Visit is a new health record linked to the original Follow-up Required record.
- Visit Type is separate from Classification.
- Classification determines which form section appears.
- Status determines the outcome/action.
- Routine Monitoring means stable but still observed.
- Completed means closed.
- Referral is separate from health record status.
- QR code should only contain tracking ID/token, not full patient data.
- RHU can view patient data only through referrals assigned to its facility.

## Unclear Workflows Found In Code

- The original Follow-up Required record is not updated with a stored fulfilled flag. Fulfillment is inferred when a linked follow-up child record exists.
- Immunization + adult confirmation modal was requested in the prompt but was not found in the current Add Health Record code.
- Follow-up due today and overdue follow-up notifications are supported as list filters, but persistent backend notifications were not found.
- A separate "Referral accepted" notification/status was not found. The implemented statuses are Pending, Received, For Monitoring, No-Show, and Completed.
- QR scanner check-in stores a referral status update to Received. A separate check-in timestamp field was not found, but the status update/history record has timestamps.

