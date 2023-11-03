app_name = "hw_integration"
app_title = "HW Integration"
app_publisher = "8848 Digital LLP"
app_description = "Hardware Integration for printer, cashdrawer, pole display etc."
app_email = "deepak@8848digital.com"
app_license = "mit"

app_include_js = [
	"hw_integration.bundle.js",
]


fixtures = [ 
	{"dt": "Custom Field", "filters": [
		[
			"name", "in", [
				"POS Profile-custom_hardware_profile"
			]
		]
	]}
]