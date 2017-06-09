// Copyright (c) 2016, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Loan Application', {
	onload: function(frm) {
		if (frm.doc.__islocal) {
			frm.trigger("interest_type")
		}
	},
	refresh: function(frm) {
		frm.trigger("toggle_fields")
		frm.trigger("add_toolbar_buttons")
		setTimeout(function() {
			$("[data-fieldname=description]").css("height", 94)
		}, 100)
	},
	loan_type: function(frm) {
		
		// validate the loan type and set the corresponding interest type
		frm.set_value("interest_type", frm.doc.loan_type == "Vehicle" ? "Simple" : "Composite")

		frm.set_value("asset", "")
	},
	gross_loan_amount: function(frm) {
		var expense_rate_dec = frm.doc.legal_expense_rate / 100
		var loan_amount = frm.doc.gross_loan_amount * (expense_rate_dec +1)
		frm.set_value("loan_amount", loan_amount)
	},
	interest_type: function(frm) {
		// let's validate the interest_type to see what's rate type we are requesting from the server
		var field = frm.doc.interest_type == "Simple" ? "simple_rate_of_interest" : "composite_rate_of_interest"

		frappe.db.get_value("FM Configuration", "", field, function(data) {
			if (!frm.doc.rate_of_interest){
				frm.set_value("rate_of_interest", data[field])
			}
		})
	},
	repayment_method: function(frm) {
		frm.doc.monthly_repayment_amount = frm.doc.repayment_periods = ""
		frm.trigger("toggle_fields")
	},
	toggle_fields: function(frm) {
		frm.toggle_enable("monthly_repayment_amount", frm.doc.repayment_method == "Repay Fixed Amount per Period")
		frm.set_df_property("monthly_repayment_amount", "reqd", frm.doc.repayment_method == "Repay Fixed Amount per Period")

		frm.toggle_enable("repayment_periods", frm.doc.repayment_method == "Repay Over Number of Periods")
		frm.set_df_property("repayment_periods", "reqd", frm.doc.repayment_method == "Repay Over Number of Periods")
	},
	make_loan: function(frm) {

		// point to the method that we're executing now
		var method = "fm.finance_manager.doctype.loan_application.loan_application.make_loan"
		
		// the args that it requires
		var args = {
			"source_name": frm.doc.name
		}

		// callback to be executed after the server responds
		var callback = function(response) {

			// check to see if there is something back
			if (!response.message) 
				return 1 // exit code is 1

			var doc = frappe.model.sync(response.message)
			frappe.set_route("Form", response.message.doctype, response.message.name)
		}

		frappe.call({ "method": method, "args": args, "callback": callback })
	},
	add_toolbar_buttons: function(frm) {
		// check to see if the loan is approved
		if (frm.doc.status != "Approved") 
			return 0 // let's just ignore it

		var callback = function(response) {
			if (response) {
				frappe.set_route("Form", "Loan", response.name)
			} else {
				frm.trigger("make_loan")
			}			
		}

		var customer_loan =  function() {
			frappe.model.get_value("Loan", { "loan_application": frm.doc.name }, "name", callback)
		}

		frm.add_custom_button(__('Customer Loan'), customer_loan)
	}
})