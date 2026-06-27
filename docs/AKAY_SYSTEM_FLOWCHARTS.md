# AKAY System Flowcharts

This document summarizes the main AKAY workflows based on the current frontend and backend code. It is documentation only and does not change application behavior.

## Key Workflow Rules

- Every visit or check-up creates a health record.
- A Follow-up Visit is a new health record linked to the original Follow-up Required record through `parent_health_record_id`.
- Routine Monitoring means the patient is stable but still observed.
- Completed means the health record or referral is closed.
- Referral status is separate from health record status.
- QR code values should contain only a tracking ID or referral token, not full patient data.
- RHU staff can view patient information through an assigned referral context.
- Facility access is enforced in the backend for patients, health records, referrals, incoming referrals, and tracking lookup.
- The code does not store a separate "follow-up fulfilled" flag on the original health record. Fulfillment is inferred in the frontend when a linked follow-up record exists.

## 1. Overall AKAY System Flow

This is the big-picture flow from BHC consultation to RHU referral processing and BHC updates. The implemented backend supports health records, referrals, QR/tracking lookup, referral status updates, feedback/return slip submission, and notifications.

```mermaid
flowchart TD
    A["BHC/BHW creates or selects patient"] --> B["BHC/BHW creates health record"]
    B --> C{"Referral needed?"}
    C -- "No" --> D["System saves health record only"]
    C -- "Yes" --> E["BHC/BHW creates referral linked to health record"]
    E --> F["Backend generates tracking ID and QR value"]
    F --> G["Referral status starts as Pending"]
    G --> H["RHU users assigned to receiving facility are notified"]
    G --> I["Referral appears in BHC Referrals"]
    G --> J["Referral appears in RHU Incoming Referrals"]
    J --> K["RHU Staff opens referral details or QR scanner"]
    K --> L{"Verify referral"}
    L -- "Manual tracking ID" --> M["Backend checks tracking ID or QR value"]
    L -- "QR scan" --> M
    M --> N{"Valid and assigned to RHU?"}
    N -- "No" --> O["System shows not found or access error"]
    N -- "Yes" --> P["RHU Staff views patient and referral context"]
    P --> Q["RHU Staff checks in patient"]
    Q --> R["Backend updates referral status to Received"]
    R --> S["BHC referral creator is notified"]
    R --> T["RHU processes referral"]
    T --> U{"Needs monitoring?"}
    U -- "Yes" --> V["RHU marks referral For Monitoring"]
    U -- "No or done" --> W["RHU submits return slip feedback"]
    V --> W
    W --> X["Backend stores feedback and marks referral Completed"]
    X --> Y["BHC referral creator is notified"]
    Y --> Z["BHC views status and RHU return slip"]
```

## 2. Add Health Record Flow

The BHC health record form defaults new records to Initial Consultation. The patient status options are Routine Monitoring, Follow-up Required, and Completed. If Follow-up Required is selected, the form shows and requires the follow-up date field.

```mermaid
flowchart TD
    A["BHC/BHW opens Add Health Record"] --> B["System loads patient list"]
    B --> C["BHC/BHW selects patient"]
    C --> D["System sets Visit Type to Initial Consultation"]
    D --> E["BHC/BHW selects classification"]
    E --> F["BHC/BHW fills clinical details"]
    F --> G["BHC/BHW fills vital signs"]
    G --> H["BHC/BHW selects patient status"]
    H --> I{"Status selected"}
    I -- "Routine Monitoring" --> J["Follow-up date hidden or cleared"]
    I -- "Completed" --> K["Follow-up date hidden or cleared"]
    I -- "Follow-up Required" --> L["Follow-up date is shown and required"]
    J --> M["Save health record"]
    K --> M
    L --> M
    M --> N["Frontend sends POST /health-records"]
    N --> O["Backend validates patient and facility access"]
    O --> P["Backend saves health record"]
    P --> Q["Success modal opens"]
    Q --> R["View Health Record"]
    Q --> S["Back to Health Records"]
    Q --> T{"Create Referral allowed?"}
    T -- "BHC role, new record, not Completed" --> U["Create Referral if Needed"]
    T -- "Not allowed" --> V["Referral action is hidden"]
```

## 3. Follow-up Visit Flow

A follow-up visit starts from an existing health record marked Follow-up Required. The new follow-up is a separate health record linked to the original record.

```mermaid
flowchart TD
    A["Original health record status is Follow-up Required"] --> B["BHW finds record"]
    B --> C{"Entry point"}
    C -- "Health Records filters" --> D["Open full health record"]
    C -- "Patient Details history" --> E["Click View Full Record"]
    E --> D
    D --> F["Click Record Follow-up Visit"]
    F --> G["Follow-up form opens with recordId and mode=follow-up"]
    G --> H["Patient context is locked from original record"]
    H --> I["Visit Type becomes Follow-up Visit"]
    I --> J["Form includes parent_health_record_id"]
    J --> K["BHW fills follow-up clinical details"]
    K --> L["BHW selects new status"]
    L --> M{"New status"}
    M -- "Routine Monitoring" --> N["No next follow-up required"]
    M -- "Follow-up Required" --> O["New follow-up date required"]
    M -- "Completed" --> P["Follow-up chain can close"]
    N --> Q["Save new health record"]
    O --> Q
    P --> Q
    Q --> R["Backend validates parent record"]
    R --> S{"Parent is Follow-up Required?"}
    S -- "No" --> T["Backend rejects request"]
    S -- "Yes" --> U["Backend saves linked follow-up record"]
    U --> V["Success modal confirms follow-up saved"]
    U --> W["Original fulfillment is inferred by linked child record"]
```

Note: The backend does not update the original health record to a fulfilled status. The BHC health records list checks whether a follow-up child exists.

## 4. Referral Creation Flow

Referral creation is separate from saving the health record. The referral is linked to the saved health record when `health_record_id` is sent.

```mermaid
flowchart TD
    A["Health record is saved first"] --> B["BHC/BHW chooses Create Referral if Needed"]
    B --> C["Create Referral page loads patient and health record context"]
    C --> D["System checks for existing referral linked to record"]
    D --> E{"Existing linked referral?"}
    E -- "Yes" --> F["Navigate to existing referral details"]
    E -- "No" --> G["System checks active referrals for patient"]
    G --> H{"Active referral exists?"}
    H -- "Yes" --> I["Show active referral warning"]
    H -- "No" --> J["BHC/BHW fills referral slip"]
    I --> J
    J --> K["BHC/BHW submits referral"]
    K --> L["Frontend sends POST /referrals"]
    L --> M["Backend validates patient and optional health record link"]
    M --> N["Backend generates tracking ID"]
    N --> O["Backend generates QR value AKAY:REFERRAL:<tracking ID>"]
    O --> P["Backend saves referral as Pending"]
    P --> Q["Backend creates referral update history"]
    Q --> R["RHU users at destination facility are notified"]
    R --> S["Referral appears in BHC Referrals"]
    S --> T["Referral appears in RHU Incoming Referrals"]
    T --> U["BHC can print referral slip with QR"]
```

## 5. RHU Incoming Referral Flow

The RHU Incoming Referrals page fetches referrals assigned to the logged-in RHU staff user's facility. The backend scope prevents RHU users from accessing referrals assigned elsewhere.

```mermaid
flowchart TD
    A["RHU Staff opens Incoming Referrals"] --> B["Frontend calls GET /incoming-referrals"]
    B --> C["Backend requires rhu_staff role"]
    C --> D["Backend filters by user's rural_health_unit_id"]
    D --> E["System returns assigned incoming referrals only"]
    E --> F["RHU Staff filters or searches queue"]
    F --> G["RHU Staff opens referral details"]
    G --> H["Frontend calls referral details or tracking lookup"]
    H --> I["Backend verifies assigned RHU facility"]
    I --> J{"Authorized?"}
    J -- "No" --> K["Show access restricted or error state"]
    J -- "Yes" --> L["Show referral details"]
    L --> M["Patient data is shown through referral context"]
    M --> N["RHU can receive, monitor, mark no-show, or submit return slip"]
```

## 6. QR Scanner Verification Flow

The QR scanner uses the camera through `html5-qrcode`, and it also supports manual entry. The frontend normalizes QR payloads before asking the backend to verify the referral.

```mermaid
flowchart TD
    A["RHU Staff opens QR Scanner"] --> B{"Choose verification mode"}
    B -- "Camera" --> C["Start webcam scanner"]
    B -- "Manual" --> D["Enter tracking ID, referral URL, or AKAY QR value"]
    C --> E["Scan printed referral slip QR"]
    E --> F["QR contains tracking ID or AKAY:REFERRAL:<tracking ID>"]
    D --> G["Normalize entered value"]
    F --> G
    G --> H["Extract tracking ID"]
    H --> I{"Tracking ID found?"}
    I -- "No" --> J["Show invalid QR or invalid tracking ID error"]
    I -- "Yes" --> K["Frontend calls GET /tracking/{tracking ID}"]
    K --> L["Backend finds referral by tracking_id or qr_code_value"]
    L --> M["Backend checks user's assigned facility"]
    M --> N{"Valid and assigned to RHU?"}
    N -- "No" --> O["Show not found or not assigned error"]
    N -- "Yes" --> P["Show referral result and patient context"]
    P --> Q{"Already checked in?"}
    Q -- "Yes" --> R["Show already checked in warning"]
    Q -- "No" --> S["RHU Staff clicks Check-in Patient"]
    S --> T["Frontend updates referral status to Received"]
    T --> U["Backend records status update"]
    U --> V["Backend notifies BHC referral creator"]
    T --> W["Frontend also creates local RHU facility notification"]
```

Note: The persistent BHC check-in notification is implemented in the backend when RHU updates the referral status to Received. The local RHU facility notification in the QR scanner is frontend cache behavior.

## 7. Notification Flow

Notifications are stored in `user_notifications` and exposed through `/notifications`. Users can list, mark as read, mark all read, and delete notifications.

### Implemented Notifications

```mermaid
flowchart TD
    A["BHC/BHW creates referral"] --> B["Backend finds active RHU users at destination RHU"]
    B --> C["Backend creates notification: New referral submitted"]
    C --> D["RHU notification dropdown or inbox loads /notifications"]

    E["RHU updates referral status"] --> F["Backend creates status update history"]
    F --> G{"Status is Received?"}
    G -- "Yes" --> H["Backend creates notification: Patient checked in at RHU"]
    G -- "No" --> I["Backend creates notification: Referral status updated"]
    H --> J["BHC referral creator sees notification"]
    I --> J

    K["RHU submits feedback/return slip"] --> L["Backend saves feedback"]
    L --> M["Backend marks referral Completed"]
    M --> N["Backend creates notification: Feedback submitted"]
    N --> O["BHC referral creator sees notification"]
```

### Planned / Not Yet Implemented Notifications

```mermaid
flowchart TD
    A["Follow-up due today"] --> B["Planned / Not yet implemented notification"]
    C["Follow-up overdue"] --> D["Planned / Not yet implemented notification"]
    E["Automated no-show detection"] --> F["Planned / Not yet implemented notification"]
    G["Automated RHU reminder for pending referrals"] --> H["Planned / Not yet implemented notification"]
```

## 8. Patient Details Flow

The BHC Patient Details page shows the patient profile, latest consultation link, health record history, and referral history. Follow-up recording is supported after opening the full health record, not directly from the patient history table.

```mermaid
flowchart TD
    A["BHC/BHW opens Patient Details"] --> B["Frontend loads patient profile"]
    B --> C["Frontend loads patient's health records"]
    B --> D["Frontend loads patient's referrals"]
    C --> E["System identifies latest consultation"]
    E --> F["Latest consultation is shown as a link"]
    C --> G["Health record history table is shown"]
    D --> H["Referral history table is shown"]
    G --> I["BHW clicks View Full Record"]
    I --> J["Health Record Details opens"]
    J --> K{"Record status is Follow-up Required?"}
    K -- "Yes" --> L["Record Follow-up Visit action is available"]
    K -- "No" --> M["Follow-up action is hidden"]
    L --> N["Follow-up form opens linked to original record"]
    H --> O["BHW clicks View Referral"]
    O --> P["Referral Details opens"]
    P --> Q["BHW views clinical summary and RHU return slip if available"]
```

## Workflows That Are Unclear Or Not Fully Implemented

- Original follow-up fulfillment is not stored as a backend field. The frontend infers fulfillment by checking if a child follow-up record exists.
- Follow-up due today and overdue follow-up notifications are not implemented as persistent backend notifications.
- The QR payload can be a plain tracking ID, `AKAY:REFERRAL:<tracking ID>`, URL, or JSON containing a tracking value. The backend officially verifies `tracking_id` and `qr_code_value`; frontend normalization handles the other input shapes.
- The RHU "patient link" during check-in returns the patient already attached to the referral. It does not create a separate RHU patient record in the current frontend service.
- Some frontend return slip display fields, such as `dateOfReceipt` and `assessmentOutcome`, are richer than the backend feedback payload currently stores. The backend-supported feedback fields are diagnosis, action taken, treatment notes, recommendation, receiving practitioner, remarks, and received timestamp.

