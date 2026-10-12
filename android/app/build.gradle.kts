plugins {
    id("com.android.application")
}

android {
    namespace = "app.costyzarla.sync"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.costyzarla.sync"
        // Android 14+: Health Connect is part of the system.
        minSdk = 34
        targetSdk = 36
        versionCode = (System.getenv("BUILD_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("BUILD_NUMBER") ?: "0"}"
        buildConfigField("String", "SERVER_URL", "\"https://cos-ty-zarla.vercel.app\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        // Kept in the repo on purpose (private two-person app): every build is signed
        // with the same key, so updates install over the previous version.
        create("release") {
            storeFile = rootProject.file("keystore/release.jks")
            storePassword = "costyzarla-sync"
            keyAlias = "costyzarla"
            keyPassword = "costyzarla-sync"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime:2.12.0")
    implementation("androidx.activity:activity:1.13.0")
}
