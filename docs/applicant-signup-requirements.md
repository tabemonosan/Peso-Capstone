# Applicant signup requirements

The online NSRP signup and update wizard requires religion, height (50–250 cm), and employment type. Religion includes “None” and “Prefer not to say”. Employment type choices depend on the employment status selected.

Each language row has a **Select all** checkbox for reading, writing, speaking, and understanding. Clearing it clears those four choices for that language. The Others row still requires a language/dialect name when a proficiency is selected.

Any nonblank overseas country preference requires a passport number. Existing passport format and future expiry validation still applies. Local preferences do not require a passport. Server validation enforces these rules at the corresponding wizard step and final submission.

The ID catalog is shared by the signup form and server in `shared/philippineIds.js`. It includes national, professional, social insurance, driver's, senior/PWD, OFW/seafarer, government employee, local government, school/company and other government-issued IDs. National ID card, paper ePhilID, and digital formats use the existing National ID format selector. Existing stored ID labels remain compatible.

ID acceptance varies by service; these are portal upload categories subject to document review, rather than a claim that every listed ID is accepted for every government transaction. Official reference lists consulted:

- [NMIS acceptable IDs](https://nmis.gov.ph/images/pdf/forms_requirements/miedforms/lti_acceptable_ids.pdf)
- [DFA Citizen's Charter 2025](https://dfa.gov.ph/images/2025/transparency/DFA_Citizens_Charter_2025_1st_Edition_1.pdf)
- [Philippine Embassy: acceptable IDs for passport applications](https://www.philippine-embassy.org.sg/list-of-acceptable-valid-ids-for-passport-application/)

Checks cover required fields at step validation and final signup, all three overseas preference slots, language selection and clearing, and expanded ID choices in both dropdowns and real-database signup requests. Uploaded, already completed NSRP forms retain their existing upload workflow.
