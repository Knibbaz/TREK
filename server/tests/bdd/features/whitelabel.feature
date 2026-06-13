Feature: White-label admin-menu gating
  The instance owner (superadmin) decides which admin tabs the customer-admin
  may see. Only the superadmin can change that configuration.

  Scenario: A superadmin hides an admin tab
    Given a signed-in superadmin
    When the superadmin hides the admin tab "branding"
    Then the response status is 200
    And the disabled admin tabs include "branding"

  Scenario: A regular admin cannot change the white-label config
    Given a signed-in admin
    When the admin tries to hide the admin tab "gdpr"
    Then the response status is 403

  Scenario: Any admin can read the white-label config
    Given a signed-in admin
    When the admin reads the white-label config
    Then the response status is 200
