# FastAPI API Template

This is a starter template for a FastAPI application with the following technologies:

- **Framework**: FastAPI
- **Language**: Python (3.10+)
- **Validation**: Pydantic v2
- **ORM**: SQLAlchemy/SQLModel
- **Database**: PostgreSQL
- **Containerization**: Dockerized

## Getting Started

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd api-fastapi
    ```
2.  **Set up environment variables**:
    Copy `.env.example` to `.env` and fill in your database credentials.
    ```bash
    cp .env.example .env
    ```
3.  **Build and run with Docker Compose**:
    ```bash
    docker compose up --build
    ```
    The API will be available at `http://localhost:8000`.

## Project Structure

```
api-fastapi/
├── app/
│   ├── api/            # API endpoints (routers)
│   ├── core/           # Core configurations, settings, dependencies
│   ├── db/             # Database session, models, migrations
│   ├── schemas/        # Pydantic models for request/response
│   └── main.py         # FastAPI application entry point
├── tests/              # Unit and integration tests
├── .env.example        # Environment variables example
├── Dockerfile          # Dockerfile for the application
├── docker-compose.yml  # Docker Compose configuration
├── requirements.txt    # Python dependencies
└── README.md           # This file
```
