export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  role: string;
  username: string;
  screen_name: string | null;
}

export interface UserCreateRequest {
  username: string;
  email?: string;
  password: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  screen_name?: string;
}

export interface UserCreateResponse {
  id: string;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  screen_name: string | null;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  screen_name: string | null;
}

export interface UserUpdateRequest {
  first_name?: string;
  last_name?: string;
  screen_name?: string;
  email?: string;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export interface PasswordChangeResponse {
  message: string;
  changed_at: string;
}
