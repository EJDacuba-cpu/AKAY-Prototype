<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmailAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    public function test_an_unused_email_is_available(): void
    {
        $this->getJson('/api/users/email-available?email=new.person@example.test')
            ->assertOk()
            ->assertExactJson(['available' => true]);
    }

    public function test_an_email_in_use_is_taken_whatever_its_case(): void
    {
        $this->getJson('/api/users/email-available?email=MHO@Example.Test')
            ->assertOk()
            ->assertExactJson(['available' => false]);
    }

    public function test_an_inactive_account_still_holds_its_email(): void
    {
        User::create(['name' => 'Gone', 'email' => 'gone@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'inactive', 'permissions' => []]);

        $this->getJson('/api/users/email-available?email=gone@example.test')->assertOk()->assertExactJson(['available' => false]);
    }

    public function test_an_account_does_not_clash_with_its_own_email_when_editing(): void
    {
        $other = User::create(['name' => 'Other', 'email' => 'other@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'permissions' => []]);

        $this->getJson("/api/users/email-available?email=other@example.test&ignore={$other->id}")->assertOk()->assertExactJson(['available' => true]);
        $this->getJson("/api/users/email-available?email=mho@example.test&ignore={$other->id}")->assertOk()->assertExactJson(['available' => false]);
    }

    public function test_the_email_is_required(): void
    {
        $this->getJson('/api/users/email-available')->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_only_admins_can_ask(): void
    {
        $bhc = User::create(['name' => 'Midwife', 'email' => 'midwife@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($bhc, ['*']);

        $this->getJson('/api/users/email-available?email=anyone@example.test')->assertForbidden();
    }
}
