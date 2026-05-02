plugins {
  kotlin("jvm") version "2.1.21"
  kotlin("plugin.spring") version "2.1.21"
  id("org.springframework.boot") version "3.5.14"
  id("io.spring.dependency-management") version "1.1.7"
  kotlin("plugin.jpa") version "2.1.21"
  id("com.diffplug.spotless") version "6.25.0"
}

group = "com.portfolioai"

version = "0.0.1-SNAPSHOT"

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

repositories { mavenCentral() }

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  implementation("org.springframework.boot:spring-boot-starter-cache")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("com.github.ben-manes.caffeine:caffeine")
  implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
  implementation("org.flywaydb:flyway-core")
  implementation("org.flywaydb:flyway-database-postgresql")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
  implementation("com.rometools:rome:2.1.0")
  implementation("org.apache.commons:commons-csv:1.14.1")
  runtimeOnly("org.postgresql:postgresql")
  developmentOnly("org.springframework.boot:spring-boot-devtools")
  testImplementation("org.springframework.boot:spring-boot-starter-test")
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin { compilerOptions { freeCompilerArgs.addAll("-Xjsr305=strict") } }

allOpen {
  annotation("jakarta.persistence.Entity")
  annotation("jakarta.persistence.MappedSuperclass")
  annotation("jakarta.persistence.Embeddable")
}

tasks.withType<Test> { useJUnitPlatform() }

spotless {
  kotlin {
    ktfmt("0.55").googleStyle()
    target("src/**/*.kt")
  }
  kotlinGradle { ktfmt("0.55").googleStyle() }
}
