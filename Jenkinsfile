
pipeline {
  agent any

  options {
    skipDefaultCheckout()
    // skipStagesAfterUnstable()
    //
    // Keep only last 100 builds
    //
    buildDiscarder(logRotator(numToKeepStr: '100'))
    // Timeout job after 60 minutes
    timeout(time: 10, unit: 'MINUTES')
  }

  parameters {
    booleanParam(defaultValue: false,
                 description: 'Force Build',
                 name: 'RELEASE_FORCE')
    booleanParam(defaultValue: false,
                 description: 'Production Release',
                 name: 'RELEASE_PRODUCTION')
    string(defaultValue: '',
           description: 'Force Next Version',
           name: 'RELEASE_VERSION',
           trim: true)
  }

  stages {
    //
    // CHECK OUT FROM SVN
    //
    stage("Prepare Environment") {
      steps {
        //
        // Subversion Checkout.  Delay 5 seconds first since someone decided it was a good idea
        // to grab the SVN changes by timestamp even though the HEAD commit id is known.  If the
        // server clock is off by even one half of a second, the last change will not be grabbed
        //
        echo "Subversion checkout..."
        checkout(
          poll: false,
          scm: [
            $class: "SubversionSCM",
            additionalCredentials: [],
            browser: [
                $class: "WebSVN", 
                url: "https://app1.development.pjats.com/svn/web/listing.php/?repname=pja&path=/app-publisher/${env.BRANCH_NAME}/"
            ],
            excludedCommitMessages: "\\[skip[ \\-]ci\\]",
            excludedRegions: "",
            excludedRevprop: "",
            excludedUsers: "",
            filterChangelog: false,
            ignoreDirPropChanges: false,
            includedRegions: "",
            locations: [
            [
                cancelProcessOnExternalsFail: true,
                credentialsId: "6ff47a32-994c-4ac2-9016-edb075a98e5b", // jenkins.tr.pjats.com
                // credentialsId: "31b92f3c-80ee-4cfa-887f-61c9937d4fe2", // jenkins.tr.pjats.com system acct
                // credentialsId: "9168a4c0-47d2-423b-b676-3df3adc0d9df",    // Local Dev
                depthOption: "infinity",
                ignoreExternalsOption: true,
                local: ".",
                remote: "https://svn.development.pjats.com/pja/app-publisher/${env.BRANCH_NAME}"
            ]],
            quietOperation: true,
            workspaceUpdater: [$class: "UpdateWithRevertUpdater"]
          ]
        )
        //
        // Log commit messages
        // Set variables to use throughout build process
        // Check for [skip ci] tag on last commit
        //
        script {
          def allJob = env.JOB_NAME.replace("%2F", "/").tokenize('/') as String[]
          env.PROJECT_NAME = allJob[0]    // required for email template
          env.PROJECT_BRANCH = allJob[1]  // required for email template - [1] assumes /trunk
          env.SKIP_CI = "false"
          env.RELEASE_PRODUCTION = "false"
          env.RELEASE_SKIP_APPROVAL = "false"
          env.RELEASE_VERSION = ""
          env.ARTIFACT_CHANGELOG_FILE = ""
          env.IS_NPM_PACKAGE = "true"
          //
          // Set variables to use throughout build process by examining the commit messages.
          // For SVN, its once commit per changeset (whereas Got could have multiple commits per changeset)
          // Overrides build parameters.
          //
          def changeLogSets = currentBuild.changeSets
          if (changeLogSets.size() == 0) {
            echo "   No commits exist, set skip-ci flag"
            env.SKIP_CI = "true";
          }
          for (int i = 0; i < changeLogSets.size(); i++) {
            def entries = changeLogSets[i].items
            //
            // Set environment control flags and log commit messages
            //
            echo "Log changesets and commit messages:"
            if (changeLogSets.size() == 0) {
              echo "   No commits exist, probably another f*over by this dumb SVN plugin using timestamps"
              env.SKIP_CI = "true";
            }
            for (int j = 0; j < entries.length; j++) {
                def entry = entries[j]
                echo "${entry.commitId} by ${entry.author} on ${new Date(entry.timestamp)}: ${entry.msg}"
                echo "   ${entry.msg}"
                //
                // If the [skip ci] tag is found in the last commit, then exit
                //
                if (i == 0 && j == 0) {
                  //
                  // If the [skip ci] or [ci skip] tag is found in the last commit, then don't build
                  //
                  if (entry.msg.indexOf("[skip-ci]") != -1 || entry.msg.indexOf("[skip ci]") != -1 || entry.msg.indexOf("[skipci]") != -1 ||
                      entry.msg.indexOf("[ci-skip]") != -1 || entry.msg.indexOf("[ci skip]") != -1 || entry.msg.indexOf("[ciskip]") != -1) {
                    echo "The 'skip ci' tag was found in the last commit"
                    env.SKIP_CI = "true"
                  }
                  //
                  // Check for skip-approval changelog tag
                  //
                  if (entry.msg.indexOf("[release-skip-approval]") != -1) {
                    env.RELEASE_SKIP_APPROVAL = "true"
                  }
                  //
                  // Check new branch default msg
                  //
                  if (entry.msg.indexOf("Created new branch") != -1) {
                    echo "The 'Created new branch' text was found in the last commit"
                    env.SKIP_CI = "true"
                  }
                }
                //
                // List files in this commit
                //
                def files = new ArrayList(entry.affectedFiles)
                for (int k = 0; k < files.size(); k++) {
                    def file = files[k]
                    echo "  ${file.editType.name} ${file.path}"
                }
            }
          }
          //
          // Params override the environment.  Note that boolean params will be converted to
          // string when writing to the env object.
          //
          if (params.RELEASE_PRODUCTION == true) {
            env.RELEASE_PRODUCTION = params.RELEASE_PRODUCTION
          }
          if (params.RELEASE_VERSION != "") {
            echo "Build parameter RELEASE_VERSION is set: ${params.RELEASE_VERSION}"
            env.RELEASE_VERSION = params.RELEASE_VERSION
          }
          if (params.RELEASE_FORCE == true) {
            echo "Build parameter RELEASE_FORCE is set, reset SKIP_CI"
            env.SKIP_CI = "false"
          }
          if (env.BRANCH_NAME != null && env.BRANCH_NAME != "trunk") {
            env.PROJECT_BRANCH = allJob[2]  // [2] is branch name project/branches/branchname
          }
          if (env.TAG_NAME != null) {
            env.RELEASE_PRODUCTION = "false"
            env.PROJECT_BRANCH = allJob[2]  // [2] is branch name project/branches/branchname
          }
          echo "Job Properties:"
          echo "   Project               : ${currentBuild.projectName}"
          echo "   Name                  : ${env.JOB_NAME}"
          echo "   Branch Project        : ${env.PROJECT_NAME}"  
          echo "   Branch                : ${env.PROJECT_BRANCH}"
          if (env.BRANCH_NAME != null) {
            echo "   Branch Path           : ${env.BRANCH_NAME}"
          }
          else {
            echo "   Branch Path           : N/A"
          }
          if (env.TAG_NAME != null ) {
            echo "   Tag Path              : ${env.TAG_NAME}"
          }
          else {
            echo "   Tag Path              : N/A"
          }
          echo "Build Environment:"
          echo "   Production release  : ${env.RELEASE_PRODUCTION} (tbd)"
          echo "   Force Release       : ${env.RELEASE_FORCE}"
          echo "   Force Version       : ${env.RELEASE_VERSION}"
          echo "   Skip CI             : ${env.SKIP_CI}"
          echo "   Skip Approvals      : ${env.RELEASE_SKIP_APPROVAL}"
        }
      }
    }

    //
    // PRE-BUILD
    //
    stage("Pre-Build") {
      when {
        expression { env.SKIP_CI == "false" }
      }
      steps {
        //
        // If the [skip ci] tag is found in the last commit, then exit
        //
        nodejs("Node 12") {
          script {
            env.NEXTVERSION  = ""
            env.CURRENTVERSION  = ""
            //
            // NPM Install
            //
            bat "npm install"
            //
            // app-publisher is used so check for .publishrc file
            //
            def apRcExists = fileExists '.publishrc.pja.json'
            if (apRcExists == false) {
              error(".publishrc.pja.json not found, cannot run app-publisher")
            }
            //
            // Get version info
            //
            echo "Get current version"
            //env.CURRENTVERSION = stdout.split("|")[0]
            //env.NEXTVERSION = stdout.split("|")[1]
            env.CURRENTVERSION = bat(returnStdout: true,
                                     script: """
                                       @echo off
                                       app-publisher --config-name pja --task-version-current
                                     """)
            echo "Get next version"
            if (env.TAG_NAME == null) {
              echo "This is not /tags - update version files"
              if (env.RELEASE_VERSION != "") {
                echo "Next version is set by build parameter"
                env.NEXTVERSION = env.RELEASE_VERSION
              }
              else {
                env.NEXTVERSION = bat(returnStdout: true,
                                      script: """
                                        @echo off
                                        app-publisher --config-name pja --task-version-next
                                      """)
              }
              if (env.CURRENTVERSION != env.NEXTVERSION) {
                echo "Version bumped, a release will be performed"
                env.RELEASE_PRODUCTION = "true"
              }
            }
            else {
              echo "This is /tags/${env.TAG_NAME}, set next version to current"
              env.NEXTVERSION = env.CURRENTVERSION
            }
            echo "Current version is ${env.CURRENTVERSION}"
            echo "Next proposed version is ${env.NEXTVERSION}"
            //
            // If the version didnt change, there'll be no release and we dont need to run --task-version-update
            //
            if (env.NEXTVERSION == "" || env.CURRENTVERSION == "") {
              echo "The current or next version could not be found, fail"
              env.RELEASE_PRODUCTION = "false"
              sh "exit 1" // fail!! does it work???
            }
            if (env.NEXTVERSION == env.CURRENTVERSION) {
              echo "The current version is equal to the next version, unset release flags"
              env.RELEASE_PRODUCTION = "false"
            }
            else { //
                  // Update version files
                //
                echo "Update version files"
                bat "app-publisher --config-name pja --task-version-update --version-force-next ${env.NEXTVERSION}"
            }
          }
        }
      }
    }

    //
    // BUILD
    //
    stage("Build") {
      when {
        expression { env.SKIP_CI == "false" }
      }
      steps {
        nodejs("Node 12") {
          echo "Build project"
          bat "npm run clean-build"
          bat "npm run webpack-build"
        }
      }
    }

    //
    // TESTS
    //
    stage("Tests") {
      when {
        expression { env.SKIP_CI == "false" }
      }
      // environment {
      //   CODECOV_TOKEN = env.CODEDOV_TOKEN_AP
      // }
      steps {
        echo "Run tests"
        // nodejs("Node 12") {
        //   bat "npm run clean-build"
        //   bat "npm run build"
        //   bat "npm run test"
        //   echo "Publish test results"
        //   // sh "tools/codecov.sh"
        // }
      }
    }

    //
    // HISTORY FILE
    //
    stage("History File") {
      //
      // Only when we have a [production-release] commit
      //
      when {
        expression { env.RELEASE_PRODUCTION == "true" && env.SKIP_CI == "false" }
        // expression { env.RELEASE_PRODUCTION }   // for testing
      }
      steps {
        script {
          def historyEntry = ""
          def historyHeader = ""
          echo "Approval needed for Version ${env.NEXTVERSION} History File Changelog"
          //
          // Populate and open history.txt in Notepad, then will wait for user intervention
          //
          nodejs("Node 12") {
            echo "Write history file"
            bat "app-publisher --config-name pja --task-changelog --version-force-next ${env.NEXTVERSION}" 
            echo "Retrieve new history file section"
            historyEntry = bat(returnStdout: true,
                                script: """
                                  @echo off
                                  app-publisher --config-name pja --task-changelog-print-version ${env.NEXTVERSION}
                                """)
            //
            // Set in environment for email template scripts
            //
            env.VERSION_CHANGELOG = "<font face=\"courier new\">" + historyEntry.replace("\r\n", "<br>").replace(" ", "&nbsp;") + "</font>"
          }
          if (env.RELEASE_SKIP_APPROVAL != "true") {
            //
            // Open history.txt file in notepad using utility server listening on 4322
            //
            echo "Jenkins-utility-server: Send request to open history.txt in Notepad"
            def jsonEncWs = WORKSPACE.replace("\\", "\\\\") as String
            def bodyJson = "{\"path\": \"${jsonEncWs}\\\\doc\\\\history.txt\", \"token\": \"${env.JENKINS_UTILITY_SERVER_TOKEN}\"}"
            try {
              httpRequest acceptType: 'APPLICATION_JSON', contentType: 'APPLICATION_JSON', httpMode: 'POST', requestBody: bodyJson, url: "http://localhost:4322/openfile"
            }
            catch (e) {
              echo "Could not contact jenkins-utility-server, ensure it is running"
              echo "Error:";
              echo e.toString();
            }
            //
            // Notify of input required
            //
            echo "Notify of pending required changelog approval"
            emailext body: '${SCRIPT,template="changelog-approval.groovy"}',
                    attachLog: false,
                    mimeType: 'text/html',
                    subject: "Changelog Approval Required - App Publisher v${env.NEXTVERSION}: Build : " + env.PROJECT_BRANCH,
                    to: "cirelease@pjats.com",
                    recipientProviders: [developers(), requestor()] 
            //
            // Wait for user intervention, approval of new version # and history entry
            //
            echo "Waiting for user approval..."
            def changelogLoc = "d:\\Jenkins\\root\\workspace\\${PROJECT_NAME}_${PROJECT_BRANCH}\\doc\\history.txt"
            def inputMessage = "Approve Version ${env.NEXTVERSION} History File Changelog"
            def userInput = input id: 'changelogapproval',
                                  message: inputMessage,
                                  ok: 'Approve', 
                                  submitter: 'smeesseman,mnast',
                                  submitterParameter: 'UserID',
                                  parameters: [
                                    string(defaultValue: 'smeesseman', description: 'Network User ID of approver', name: 'UserID', trim: true),
                                    string(defaultValue: env.NEXTVERSION, description: 'Next version #', name: 'Version', trim: true),
                                    choice(choices: ['No', 'Yes'], description: 'Append changelog to history file (if not, manually edit and save)', name: 'Append'),
                                    string(defaultValue: changelogLoc, description: 'History File Location (Read Only)', name: 'File', trim: true),
                                    text(defaultValue: historyEntry, description: 'History File Entry', name: 'Changelog')
                                  ]
            //
            // Save user input to variables. Default to empty string if not found.
            //
            def inputUserID = userInput.UserID?:''
            def inputAppend = userInput.Append?:''
            def inputChangelog = userInput.Changelog?:''
            def inputVersion = userInput.Version?:''
            echo "Verified history.txt, proceeding"
            echo "   User    : ${inputUserID}"
            echo "   Append  : ${inputAppend}"
            echo "   Version : ${inputVersion}"
            env.NEXTVERSION = inputVersion
            if (inputAppend == "Yes") {
              bat "svn revert doc\\history.txt"
              nodejs("Node 12") {
                historyHeader = bat(returnStdout: true,
                                      script: """
                                      @echo off
                                      app-publisher --config-name pja --task-changelog-hdr-print-version ${env.NEXTVERSION}
                                    """)
              }
              bat "echo Version ${historyHeader} >> .\\doc\\history.txt"
              bat "echo Version ${historyEntry} >> .\\doc\\history.txt"
            }
            echo "Retrieve edited history file section"
            nodejs("Node 12") {
              historyEntry = bat(returnStdout: true,
                                  script: """
                                  @echo off
                                  app-publisher --config-name pja --task-changelog-print-version ${env.NEXTVERSION}
                                  """)
              //
              // Re-set in environment for email template scripts
              //
              def tmpDir = "${WORKSPACE_TMP}\\doc"
              def tmpDirExists = fileExists tmpDir
              if (tmpDirExists == false) {
                bat "mkdir ${tmpDir}"
              }
              env.ARTIFACT_CHANGELOG_FILE = "${tmpDir}\\history-v${NEXTVERSION}.txt"
              env.VERSION_CHANGELOG = "<font face=\"courier new\">" + historyEntry.replace("\r\n", "<br>").replace(" ", "&nbsp;") + "</font>"
              echo "Write version-only history file artifact to '${env.ARTIFACT_CHANGELOG_FILE}'"
              writeFile file: env.ARTIFACT_CHANGELOG_FILE, text: historyEntry
            }
          }
        }
      }
    }

    //
    // PUBLISH
    //
    stage("Publish") {
      when {
        expression { env.RELEASE_PRODUCTION == "true" && env.SKIP_CI == "false"  }
      }
      steps {
        script {
          echo "Store Jenkins Artifacts"
          //
          // Production or nightly release, or not
          //
          nodejs("Node 12") {
            echo "Publish production release"
            //
            // NPM and MantisBT Release
            //
            echo "Perform NPM and MantisBT Releases"
            bat "app-publisher --config-name pja --task-mantisbt-release --task-npm-release --version-force-next ${env.NEXTVERSION}"
          }
          def artifacts = "doc/history.txt,install/dist/app-publisher.tgz";
          if (env.ARTIFACT_CHANGELOG_FILE != "") {
            artifacts = "${artifacts},${env.ARTIFACT_CHANGELOG_FILE}"
          }
          archiveArtifacts allowEmptyArchive: true, 
                           artifacts: artifacts,
                           followSymlinks: false,
                           onlyIfSuccessful: true
        }
      }
    }

    //
    // COMMIT / TAG
    //
    stage("Commit") {
      when {
        expression { env.RELEASE_PRODUCTION == "true" && env.SKIP_CI == "false"  }
      }
      steps {
        echo "Commit modified files and tag version ${env.NEXTVERSION} in SVN."
        nodejs("Node 12") {
          bat "app-publisher --config-name pja --task-commit --task-tag --version-force-next ${env.NEXTVERSION}"
        }
      }
    }

    //
    // NOTIFY
    //
    stage("Notify") {
      when {
        expression { env.SKIP_CI == "false" }
      }
      steps {
        //
        // Release notifications
        //
        echo "Send notification email"
        script {
          //
          // Production release only post success tasks
          //
          if (env.RELEASE_PRODUCTION == "true") {
            //
            // Format the extracted changelog to display as text/html email mime
            //
            emailext body: '${SCRIPT,template="release.groovy"}',
                     attachLog: true,
                     compressLog: true,
                     mimeType: 'text/html',
                     subject: "App Publisher v${env.NEXTVERSION} Has Been Released",
                     to: "productrelease@pjats.com",
                     recipientProviders: [developers(), requestor()]
          }
          else {
            //
            // Send build status notification email
            // Skip on sucess since Success stage will send notification
            //  
            emailext body: '${SCRIPT,template="release.groovy"}', 
                    attachLog: true,
                    compressLog: true,
                    mimeType: 'text/html',
                    subject: "App Publisher Build ${BUILD_NUMBER} : " + currentBuild.currentResult + " : " + env.PROJECT_BRANCH,
                    to: "cirelease@pjats.com",
                    recipientProviders: [developers(), requestor()]
          }
        }
      }
    }
  //
  // END STAGES
  //
  }

  //
  // POST PROCESSING / MANTIS
  //
  post {
    //
    // ALWAYS
    //
    always {
      script {
        if (env.SKIP_CI == "true") {
          echo "Set build status to NOT_BUILT"
          currentBuild.result = 'NOT_BUILT'
        }
      }
      echo "Build finished: Status ${currentBuild.result}" 
    }
    //
    // FAILURE
    //
    failure { 
      echo "Build failed" 
      script {
        if (env.SKIP_CI == "false") {
          echo "Add issue to Mantis"
          mantisIssueAdd keepTicketPrivate: true, threshold: 'failureOrUnstable'
        }
      }
      echo "Send notification email"
      emailext body: '${SCRIPT,template="release.groovy"}', 
               attachLog: true,
               compressLog: true,
               mimeType: 'text/html',
               subject: "Build ${BUILD_NUMBER} : " + currentBuild.currentResult + " : " + env.PROJECT_BRANCH,
               to: "cirelease@pjats.com",
               recipientProviders: [developers(), requestor()]
    }
    //
    // SUCCESS
    //
    success {
      echo "Build successful"
      script {
        if (env.SKIP_CI == "false") {
          echo "Update issues in Mantis"
          mantisIssueUpdate keepNotePrivate: false, recordChangelog: true, setStatusResolved: true, threshold: 'failureOrUnstable'
        }
      }
    }
  }

}
