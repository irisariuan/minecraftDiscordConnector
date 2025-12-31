#!/bin/bash

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to wait for database
wait_for_db() {
    print_status "Waiting for PostgreSQL to be ready..."

    # Extract database connection details from DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed 's/.*@\([^:]*\):.*/\1/')
    DB_PORT=$(echo $DATABASE_URL | sed 's/.*:\([0-9]*\)\/.*/\1/')
    DB_USER=$(echo $DATABASE_URL | sed 's/.*\/\/\([^:]*\):.*/\1/')
    DB_NAME=$(echo $DATABASE_URL | sed 's/.*\/\([^?]*\).*/\1/')

    # Wait for PostgreSQL to be ready
    while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
        print_status "Database not ready, waiting 2 seconds..."
        sleep 2
    done

    print_success "PostgreSQL is ready!"
}

# Function to run database migrations
run_migrations() {
    print_status "Running database migrations..."

    # Check if database exists and create if needed
    if ! bunx prisma db push --accept-data-loss; then
        print_error "Failed to push database schema"
        exit 1
    fi

    # Generate Prisma client
    if ! bunx prisma generate; then
        print_error "Failed to generate Prisma client"
        exit 1
    fi

    print_success "Database migrations completed!"
}

# Function to validate environment variables
validate_env() {
    print_status "Validating environment variables..."

    required_vars=(
        "DATABASE_URL"
        "TOKEN"
        "CLIENT_ID"
        "UPLOAD_URL"
    )

    missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            print_error "  - $var"
        done
        exit 1
    fi

    print_success "Environment variables validated!"
}

# Function to setup server directory
setup_server_directory() {
    if [ -n "$SERVER_DIR" ]; then
        print_status "Setting up server directory: $SERVER_DIR"
        mkdir -p "$SERVER_DIR"
        chown -R $(whoami):$(whoami) "$SERVER_DIR" 2>/dev/null || true
        print_success "Server directory setup completed!"
    else
        print_warning "SERVER_DIR not set, skipping server directory setup"
    fi
}

# Function to register Discord commands (if needed)
register_commands() {
    if [ "$REGISTER_COMMANDS" = "true" ]; then
        print_status "Registering Discord commands..."
        if [ -f "tools/register.ts" ]; then
            bun tools/register.ts || print_warning "Command registration failed, continuing..."
        else
            print_warning "tools/register.ts not found, skipping command registration"
        fi
    else
        print_status "Skipping command registration (REGISTER_COMMANDS not set to 'true')"
    fi
}

# Function to create initial admin user (if needed)
create_admin_user() {
    if [ -n "$ADMIN_USER_ID" ]; then
        print_status "Setting up admin user permissions..."
        if [ -f "tools/editPerm.ts" ]; then
            echo "Setting admin permissions for user: $ADMIN_USER_ID"
            # This would need to be customized based on your actual admin setup script
        else
            print_warning "tools/editPerm.ts not found, skipping admin user setup"
        fi
    else
        print_status "ADMIN_USER_ID not set, skipping admin user setup"
    fi
}

# Function to check if this is first run
is_first_run() {
    [ ! -f "/app/data/.initialized" ]
}

# Main initialization function
initialize() {
    print_status "Starting Discord Bot initialization..."

    # Validate environment variables
    validate_env

    # Wait for database
    wait_for_db

    # Run database migrations
    run_migrations

    # Setup server directory
    setup_server_directory

    # Register commands if this is the first run or if explicitly requested
    if is_first_run || [ "$REGISTER_COMMANDS" = "true" ]; then
        register_commands
    fi

    # Create admin user if specified
    create_admin_user

    # Mark as initialized
    mkdir -p /app/data
    touch /app/data/.initialized

    print_success "Initialization completed!"
}

# Function to start the application
start_app() {
    print_status "Starting Discord Bot..."

    # Check if we should run in development mode
    if [ "$NODE_ENV" = "development" ]; then
        print_status "Running in development mode..."
        exec bun --hot index.ts
    else
        print_status "Running in production mode..."
        exec bun index.ts
    fi
}

# Main execution
main() {
    # Handle special cases
    case "${1:-}" in
        "migrate")
            print_status "Running migrations only..."
            validate_env
            wait_for_db
            run_migrations
            exit 0
            ;;
        "register")
            print_status "Registering commands only..."
            validate_env
            REGISTER_COMMANDS=true register_commands
            exit 0
            ;;
        "shell")
            print_status "Starting shell..."
            exec /bin/bash
            ;;
        "help")
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  migrate   Run database migrations only"
            echo "  register  Register Discord commands only"
            echo "  shell     Start an interactive shell"
            echo "  help      Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  REGISTER_COMMANDS=true    Force command registration on startup"
            echo "  ADMIN_USER_ID=<id>       Discord user ID to grant admin permissions"
            echo "  NODE_ENV=development     Run in development mode with hot reload"
            exit 0
            ;;
    esac

    # Normal startup process
    initialize
    start_app
}

# Execute main function with all arguments
main "$@"
