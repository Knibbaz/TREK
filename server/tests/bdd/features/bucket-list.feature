Feature: Personal bucket list per country
  As a traveller I keep a wishlist of places per country in Atlas,
  so they can resurface when I plan a trip there.

  Background:
    Given a signed-in user

  Scenario: Adding a place to the bucket list
    When the user adds "Cala Comte" in country "ES" to their bucket list
    Then the response status is 201
    And the bucket list contains "Cala Comte"

  Scenario: The bucket list is private to each user
    Given another signed-in user
    When the first user adds "Sagrada Familia" in country "ES" to their bucket list
    Then the other user's bucket list does not contain "Sagrada Familia"

  Scenario: Removing a bucket list item
    Given the user has a bucket list item "Teide" in country "ES"
    When the user deletes that bucket list item
    Then the response status is 200
    And the bucket list does not contain "Teide"

  Scenario: A name is required
    When the user adds "" in country "ES" to their bucket list
    Then the response status is 400
